import { useEffect, useRef, useState } from "react";
import { api } from "../api/client";
import type { LaunchTarget } from "../api/types";
import { canLaunchTarget, formatLaunchFeedback, isCurrentEmployee, launchKindLabel } from "../state/launchMenu";
import { toFormError } from "../ui/errors";

const FEEDBACK_DURATION_MS = 2500;

type Props = {
  employeeId: string;
  onError: (message: string | null) => void;
};

/** Dropdown menu for opening the active employee workspace in an external app, CLI, or folder. */
export function OpenExternalMenu({ employeeId, onError }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [targets, setTargets] = useState<LaunchTarget[]>([]);
  const [launchingId, setLaunchingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const activeEmployeeRef = useRef(employeeId);
  const mountedRef = useRef(true);
  const fetchSeqRef = useRef(0);
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  activeEmployeeRef.current = employeeId;

  const clearFeedbackTimer = () => {
    if (feedbackTimerRef.current !== null) {
      clearTimeout(feedbackTimerRef.current);
      feedbackTimerRef.current = null;
    }
  };

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearFeedbackTimer();
    };
  }, []);

  useEffect(() => {
    setOpen(false);
    setLoading(false);
    setTargets([]);
    setLaunchingId(null);
    setFeedback(null);
    clearFeedbackTimer();
  }, [employeeId]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const toggle = () => {
    if (open) {
      setOpen(false);
      return;
    }

    const requestEmployeeId = employeeId;
    const seq = ++fetchSeqRef.current;
    setOpen(true);
    setLoading(true);
    onError(null);

    void api
      .getLaunchTargets(requestEmployeeId)
      .then((res) => {
        if (!mountedRef.current || !isCurrentEmployee(requestEmployeeId, activeEmployeeRef.current) || fetchSeqRef.current !== seq) {
          return;
        }
        setTargets(res.targets);
      })
      .catch((err) => {
        if (!mountedRef.current || !isCurrentEmployee(requestEmployeeId, activeEmployeeRef.current) || fetchSeqRef.current !== seq) {
          return;
        }
        onError(toFormError(err).message);
        setOpen(false);
      })
      .finally(() => {
        if (mountedRef.current && isCurrentEmployee(requestEmployeeId, activeEmployeeRef.current) && fetchSeqRef.current === seq) {
          setLoading(false);
        }
      });
  };

  const handleLaunch = async (target: LaunchTarget) => {
    if (!canLaunchTarget(target) || launchingId !== null) return;

    const requestEmployeeId = employeeId;
    setLaunchingId(target.id);
    onError(null);

    try {
      await api.launchExternal(requestEmployeeId, target.id);
      if (!mountedRef.current || !isCurrentEmployee(requestEmployeeId, activeEmployeeRef.current)) {
        return;
      }
      setOpen(false);
      clearFeedbackTimer();
      setFeedback(formatLaunchFeedback(target));
      feedbackTimerRef.current = setTimeout(() => {
        feedbackTimerRef.current = null;
        if (mountedRef.current) {
          setFeedback(null);
        }
      }, FEEDBACK_DURATION_MS);
    } catch (err) {
      if (!mountedRef.current || !isCurrentEmployee(requestEmployeeId, activeEmployeeRef.current)) {
        return;
      }
      onError(toFormError(err).message);
      setOpen(false);
    } finally {
      if (mountedRef.current && isCurrentEmployee(requestEmployeeId, activeEmployeeRef.current)) {
        setLaunchingId(null);
      }
    }
  };

  return (
    <div className="launch-menu" ref={containerRef}>
      <button
        type="button"
        className="secondary"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={toggle}
      >
        Open in... ▾
      </button>
      {feedback ? (
        <span className="launch-feedback" role="status" aria-live="polite">
          {feedback}
        </span>
      ) : null}
      {open ? (
        <div className="launch-menu-popover" role="menu" aria-label="Open workspace externally">
          {loading ? (
            <p className="menu-note menu-loading">Loading...</p>
          ) : targets.length === 0 ? (
            <p className="menu-note">No launch targets available.</p>
          ) : (
            targets.map((target) => {
              const available = canLaunchTarget(target);
              return (
                <button
                  key={target.id}
                  type="button"
                  role="menuitem"
                  className="launch-menu-item"
                  disabled={!available || launchingId !== null}
                  title={target.unavailableReason ?? target.label}
                  onClick={() => void handleLaunch(target)}
                >
                  <span className="launch-menu-item-row">
                    <span className="launch-menu-label">{target.label}</span>
                    <span className="launch-menu-kind">{launchKindLabel(target.kind)}</span>
                  </span>
                  {!available && target.unavailableReason ? (
                    <span className="launch-menu-reason">{target.unavailableReason}</span>
                  ) : null}
                </button>
              );
            })
          )}
        </div>
      ) : null}
    </div>
  );
}
