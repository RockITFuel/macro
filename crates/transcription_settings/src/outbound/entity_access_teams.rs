//! [`UserTeams`] through `entity_access`, which owns team membership.

use std::sync::Arc;

use entity_access::domain::{models::AccessError, ports::EntityAccessService};
use macro_user_id::user_id::MacroUserIdStr;
use uuid::Uuid;

use crate::domain::ports::UserTeams;

/// Looks up a user's team with an [`EntityAccessService`].
#[derive(Debug)]
pub struct EntityAccessTeams<E>(pub Arc<E>);

impl<E> Clone for EntityAccessTeams<E> {
    fn clone(&self) -> Self {
        Self(self.0.clone())
    }
}

impl<E: EntityAccessService> UserTeams for EntityAccessTeams<E> {
    type Err = AccessError;

    async fn team_of(&self, user: &MacroUserIdStr<'_>) -> Result<Option<Uuid>, AccessError> {
        Ok(self
            .0
            .get_user_team(&user.0)
            .await?
            .map(|team| team.team_id))
    }
}
