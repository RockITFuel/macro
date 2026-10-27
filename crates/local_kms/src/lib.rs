//! A local stand-in for the AWS KMS operations Macro's envelope encryption
//! uses: AES-256-GCM under one 32-byte key from `LOCAL_ENCRYPTION_KEY`.
//!
//! For local and self-hosted stacks, whose LocalStack KMS keys do not survive
//! a restart (and with them every stored ciphertext). It keeps KMS's one
//! property the ciphers rely on: the encryption context is bound into every
//! ciphertext (as AES-GCM associated data), so a row moved to another owner
//! fails to decrypt.
#![deny(missing_docs)]

#[cfg(test)]
mod test;

use std::collections::{BTreeMap, HashMap};
use std::sync::Arc;

use aes_gcm::aead::{Aead, AeadCore, KeyInit, OsRng, Payload};
use aes_gcm::{Aes256Gcm, Nonce};
use base64::Engine as _;
use base64::engine::general_purpose::STANDARD;
use zeroize::Zeroizing;

macro_env_var::maybe_env_vars! {
    /// Base64 of 32 random bytes. When set, services encrypt with it instead
    /// of KMS.
    pub struct LocalEncryptionKey;
}

/// The key id stored on rows this module encrypted, in place of a KMS key ARN.
pub const KEY_ID: &str = "local:aes-256-gcm:v1";

const NONCE_LENGTH: usize = 12;
const KEY_LENGTH: usize = 32;

/// The local key. Cheap to clone; `Debug` never shows the key.
#[derive(Clone)]
pub struct LocalKms {
    cipher: Arc<Aes256Gcm>,
}

impl std::fmt::Debug for LocalKms {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str("LocalKms(redacted)")
    }
}

/// Why a local KMS operation failed. Opaque, like the KMS errors it replaces.
#[derive(Debug, thiserror::Error)]
pub enum LocalKmsError {
    /// `LOCAL_ENCRYPTION_KEY` is not base64 of exactly 32 bytes.
    #[error("LOCAL_ENCRYPTION_KEY must be base64 of 32 bytes")]
    InvalidKey,
    /// The ciphertext was written under another key id.
    #[error("ciphertext was not encrypted with the local key")]
    ForeignKey,
    /// Encryption failed, or decryption failed authentication: a wrong key,
    /// a tampered ciphertext or a different encryption context.
    #[error("local encryption operation failed")]
    Crypto,
}

impl LocalKms {
    /// The key from `LOCAL_ENCRYPTION_KEY`, or `None` when it is unset (use KMS).
    pub fn from_env() -> Result<Option<Self>, LocalKmsError> {
        match LocalEncryptionKey::new()
            .as_ref()
            .and_then(|key| key.value())
        {
            Some(encoded) if !encoded.trim().is_empty() => Self::from_base64(encoded).map(Some),
            _ => Ok(None),
        }
    }

    /// Parse a base64-encoded 32-byte key.
    pub fn from_base64(encoded: &str) -> Result<Self, LocalKmsError> {
        let bytes = Zeroizing::new(
            STANDARD
                .decode(encoded.trim())
                .map_err(|_| LocalKmsError::InvalidKey)?,
        );
        if bytes.len() != KEY_LENGTH {
            return Err(LocalKmsError::InvalidKey);
        }
        let cipher = Aes256Gcm::new_from_slice(&bytes).map_err(|_| LocalKmsError::InvalidKey)?;
        Ok(Self {
            cipher: Arc::new(cipher),
        })
    }

    /// Encrypt `plaintext` bound to `context`, like `kms:Encrypt`. The result
    /// carries its own nonce.
    pub fn encrypt(
        &self,
        context: &HashMap<String, String>,
        plaintext: &[u8],
    ) -> Result<Vec<u8>, LocalKmsError> {
        let nonce = Aes256Gcm::generate_nonce(&mut OsRng);
        let sealed = self
            .cipher
            .encrypt(
                &nonce,
                Payload {
                    msg: plaintext,
                    aad: &associated_data(context),
                },
            )
            .map_err(|_| LocalKmsError::Crypto)?;
        let mut out = nonce.to_vec();
        out.extend_from_slice(&sealed);
        Ok(out)
    }

    /// Decrypt what [`Self::encrypt`] produced under `key_id` (the id stored
    /// with the row) and the same `context`, like `kms:Decrypt`.
    pub fn decrypt(
        &self,
        key_id: &str,
        ciphertext: &[u8],
        context: &HashMap<String, String>,
    ) -> Result<Zeroizing<Vec<u8>>, LocalKmsError> {
        if key_id != KEY_ID {
            return Err(LocalKmsError::ForeignKey);
        }
        if ciphertext.len() < NONCE_LENGTH {
            return Err(LocalKmsError::Crypto);
        }
        let (nonce, sealed) = ciphertext.split_at(NONCE_LENGTH);
        let nonce: [u8; NONCE_LENGTH] = nonce.try_into().map_err(|_| LocalKmsError::Crypto)?;
        self.cipher
            .decrypt(
                &Nonce::from(nonce),
                Payload {
                    msg: sealed,
                    aad: &associated_data(context),
                },
            )
            .map(Zeroizing::new)
            .map_err(|_| LocalKmsError::Crypto)
    }

    /// A fresh AES-256 data key and its encryption under `context`, like
    /// `kms:GenerateDataKey`: (plaintext key, encrypted key).
    pub fn generate_data_key(
        &self,
        context: &HashMap<String, String>,
    ) -> Result<(Zeroizing<Vec<u8>>, Vec<u8>), LocalKmsError> {
        let data_key = Zeroizing::new(Aes256Gcm::generate_key(&mut OsRng).to_vec());
        let encrypted = self.encrypt(context, &data_key)?;
        Ok((data_key, encrypted))
    }
}

/// The context as associated data: sorted, so the same map always yields the
/// same bytes, and JSON, so no key or value can run into the next.
fn associated_data(context: &HashMap<String, String>) -> Vec<u8> {
    let sorted: BTreeMap<&String, &String> = context.iter().collect();
    serde_json::to_vec(&sorted).unwrap_or_default()
}
