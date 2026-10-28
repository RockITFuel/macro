-- Wake whoever waits on a session's turn (`WaitAgentSession`,
-- `GET /agent-sessions/{id}/wait`) when it moves: finished, blocked on a
-- question or approval, or disconnected. The replica managing the session
-- writes `turn_state`; the waiter may be on any replica, so the change travels
-- by NOTIFY, delivered on commit together with the log frames that caused it.
CREATE FUNCTION agent_session_turn_state_notify() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    PERFORM pg_notify('agent_session_turn_state', NEW.id::text);
    RETURN NULL;
END;
$$;

CREATE TRIGGER agent_session_turn_state_notify
    AFTER UPDATE OF turn_state ON agent_session
    FOR EACH ROW
    WHEN (OLD.turn_state IS DISTINCT FROM NEW.turn_state)
    EXECUTE FUNCTION agent_session_turn_state_notify();
