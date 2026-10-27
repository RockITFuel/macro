use super::*;
use chrono::TimeZone;
use macro_db_migrator::MACRO_DB_MIGRATIONS;

fn user() -> MacroUserIdStr<'static> {
    MacroUserIdStr::try_from("macro|chain@example.com".to_string()).expect("valid user id")
}

fn at(minute: u32) -> DateTime<Utc> {
    Utc.with_ymd_and_hms(2026, 10, 28, 12, minute, 0)
        .single()
        .expect("valid time")
}

fn link(id: u128, hop: u8, routine_id: Option<Uuid>, from: u32, to: u32) -> ChainLink {
    ChainLink {
        id: Uuid::from_u128(id),
        bot: BotId::TEST_A,
        user: user(),
        hop,
        routine_id,
        started_at: at(from),
        ends_at: at(to),
    }
}

#[sqlx::test(migrator = "MACRO_DB_MIGRATIONS")]
async fn activity_descends_from_the_work_whose_window_contains_it(pool: PgPool) {
    let chain = PgWorkChain::new(pool);
    let routine = Uuid::from_u128(7);
    chain.start(link(1, 2, Some(routine), 0, 10)).await.unwrap();
    chain.start(link(2, 1, None, 5, 20)).await.unwrap();

    let both = chain.cause(BotId::TEST_A, &user(), at(6)).await.unwrap();
    assert_eq!(both.hop, 2);
    assert_eq!(both.routines, vec![routine]);

    let later = chain.cause(BotId::TEST_A, &user(), at(15)).await.unwrap();
    assert_eq!(
        later,
        ChainCause {
            hop: 1,
            routines: Vec::new()
        }
    );

    let other_bot = chain.cause(BotId::TEST_B, &user(), at(6)).await.unwrap();
    assert_eq!(other_bot, ChainCause::default());
}

#[sqlx::test(migrator = "MACRO_DB_MIGRATIONS")]
async fn finishing_work_closes_its_window_after_a_grace(pool: PgPool) {
    let chain = PgWorkChain::new(pool);
    chain.start(link(1, 1, None, 0, 30)).await.unwrap();
    chain.finish(Uuid::from_u128(1), at(2)).await.unwrap();

    let grace = at(2) + TimeDelta::seconds(20);
    assert_eq!(
        chain
            .cause(BotId::TEST_A, &user(), grace)
            .await
            .unwrap()
            .hop,
        1
    );
    assert_eq!(
        chain
            .cause(BotId::TEST_A, &user(), at(3))
            .await
            .unwrap()
            .hop,
        0
    );
}

#[sqlx::test(migrator = "MACRO_DB_MIGRATIONS")]
async fn only_bot_caused_mention_sessions_count_toward_the_rate(pool: PgPool) {
    let chain = PgWorkChain::new(pool);
    chain.start(link(1, 1, None, 0, 15)).await.unwrap();
    chain.start(link(1, 1, None, 0, 15)).await.unwrap();
    chain.start(link(2, 2, None, 10, 25)).await.unwrap();
    chain.start(link(3, 0, None, 10, 25)).await.unwrap();
    chain
        .start(link(4, 1, Some(Uuid::from_u128(7)), 10, 25))
        .await
        .unwrap();

    let user = user();
    let since = |minute| chain.mention_sessions_since(BotId::TEST_A, &user, at(minute));
    assert_eq!(since(0).await.unwrap(), 2);
    assert_eq!(since(5).await.unwrap(), 1);
}
