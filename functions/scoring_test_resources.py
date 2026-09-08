"""Resource planning and outbound target preflight for scoped test handlers."""
from urllib.parse import urlsplit

from scoring_test_boundary import ScoringTestBoundaryError


def _require(condition, code):
    if not condition:
        raise ScoringTestBoundaryError(code)


def _number(value):
    return type(value) is int and 0 <= value <= 9007199254740991


def plan_resources(run, *, now_ms, upload_bytes, replayed):
    """Fixed 60-second window; replay attempts consume a rate slot, not bytes.

    Call only inside the registry transaction after authentication and binding
    checks. Byte amounts must be derived from immutable server-verified upload
    metadata by future upload handlers, not trusted client assertions.
    """
    _require(_number(now_ms) and _number(upload_bytes), "invalid-resource-input")
    audit = run.get("approvalAudit")
    if audit is None:
        # Compatibility for closed legacy fixtures: no upload authorization.
        rate_limit, byte_limit = run["maxRequests"], 0
    else:
        _require(isinstance(audit, dict), "invalid-resource-approval")
        specification = audit.get("approvedSpecification")
        _require(isinstance(specification, dict), "invalid-resource-approval")
        manifest = specification.get("executionManifest")
        _require(isinstance(manifest, dict), "invalid-resource-approval")
        limits = manifest.get("limits")
        _require(isinstance(limits, dict), "invalid-resource-approval")
        rate_limit, byte_limit = limits.get("maxRequestsPerMinute"), limits.get("maxUploadBytes")
        _require(_number(rate_limit) and rate_limit > 0 and _number(byte_limit) and byte_limit > 0,
                 "invalid-resource-limit")
        _require(limits.get("maxRequests") == run["maxRequests"] and rate_limit <= run["maxRequests"],
                 "resource-limit-mismatch")
    window = now_ms // 60000
    previous_window = run.get("requestWindow", window)
    count = run.get("requestWindowCount", 0)
    used_bytes = run.get("reservedUploadBytes", 0)
    _require(all(_number(value) for value in (previous_window, count, used_bytes)), "invalid-resource-counter")
    _require(previous_window <= window, "server-clock-regressed")
    if previous_window != window:
        count = 0
    _require(count < rate_limit, "request-rate-exhausted")
    next_bytes = used_bytes if replayed else used_bytes + upload_bytes
    _require(next_bytes <= byte_limit, "upload-budget-exhausted")
    return {"requestWindow": window, "requestWindowCount": count + 1,
            "reservedUploadBytes": next_bytes}


def approved_outbound_url(*, mode, configured_origin, approved_origin, path):
    """Preflight only, not a network sandbox or an HTTP client.

    A future transport must disable redirects and enforce DNS/IP policy. Do not
    attach this helper to an unrestricted urlopen and claim egress isolation.
    """
    _require(mode in ("local-emulator", "production-test"), "invalid-test-execution-mode")
    _require(isinstance(configured_origin, str) and configured_origin == approved_origin,
             "outbound-origin-mismatch")
    try:
        parsed = urlsplit(configured_origin)
        valid = (bool(parsed.hostname) and not parsed.username and not parsed.password
                 and not parsed.path and not parsed.query and not parsed.fragment
                 and parsed.port != 0 and not any(char.isspace() for char in configured_origin))
        if mode == "local-emulator":
            valid = valid and parsed.scheme == "http" and parsed.hostname in ("127.0.0.1", "localhost")
        else:
            valid = valid and parsed.scheme == "https"
    except ValueError:
        valid = False
    _require(valid, "invalid-outbound-origin")
    _require(isinstance(path, str) and path.startswith("/") and not path.startswith("//")
             and all(char not in path for char in ("\\", "#", "?", "%"))
             and all(part not in (".", "..") for part in path.split("/"))
             and not any(char.isspace() or ord(char) < 32 for char in path), "invalid-outbound-path")
    return configured_origin + path
