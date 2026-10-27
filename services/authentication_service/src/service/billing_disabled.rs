//! Instances without billing (local and self-hosted stacks, `BILLING_DISABLED`).
//!
//! Plans are roles: the `sub_max` role is what every entitlement check
//! (AI models and allowances, seats, email accounts, the license status the
//! app reads) treats as the top plan. With billing off every account holds it
//! from creation, and the accounts that existed before get it at startup, so
//! no plan picker, paywall or Stripe call is ever needed.

use macro_user_id::user_id::MacroUserIdStr;
use non_empty::NonEmpty;
use roles_and_permissions::domain::model::{RoleId, UserRolesAndPermissionsError};
use roles_and_permissions::domain::port::UserRolesAndPermissionsService;
use roles_and_permissions::outbound::pgpool::MacroDB;

/// The roles a paid Max subscription grants (see
/// `update_user_roles_and_permissions_for_subscription`).
pub const TOP_PLAN_ROLES: [RoleId; 2] = [RoleId::ProfessionalSubscriber, RoleId::SubMax];

/// Give every existing account the top plan.
pub async fn grant_to_all_users(db: &MacroDB) -> Result<(), UserRolesAndPermissionsError> {
    let granted = db.add_roles_to_all_users(&TOP_PLAN_ROLES).await?;
    tracing::info!(
        granted,
        "billing disabled: every account holds the top plan"
    );
    Ok(())
}

/// Give one new account the top plan.
pub async fn grant_to_user(
    roles: &impl UserRolesAndPermissionsService,
    user_id: &MacroUserIdStr<'_>,
) -> Result<(), UserRolesAndPermissionsError> {
    roles
        .dangerous_upsert_roles_for_user(
            user_id,
            NonEmpty::new(&TOP_PLAN_ROLES[..]).expect("TOP_PLAN_ROLES is non-empty"),
        )
        .await
}
