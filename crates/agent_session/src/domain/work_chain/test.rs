use super::*;

#[test]
fn activity_without_recorded_work_starts_the_first_hop() {
    assert_eq!(ChainCause::default().next_hop(DEFAULT_MAX_HOPS), Some(1));
}

#[test]
fn the_chain_stops_after_the_last_allowed_hop() {
    let cause = |hop| ChainCause {
        hop,
        routines: Vec::new(),
    };
    assert_eq!(cause(2).next_hop(3), Some(3));
    assert_eq!(cause(3).next_hop(3), None);
    assert_eq!(cause(u8::MAX).next_hop(MAX_HOPS), None);
}

#[test]
fn a_routine_produced_activity_only_when_its_run_is_a_cause() {
    let own = Uuid::from_u128(1);
    let cause = ChainCause {
        hop: 0,
        routines: vec![own],
    };
    assert!(cause.produced_by(own));
    assert!(!cause.produced_by(Uuid::from_u128(2)));
}
