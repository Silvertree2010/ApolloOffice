# Independent acceptance checks (opt in)

Enable `APOLLO_OFFICE_QUALITY_CHECKS=1` on the controller. Optionally set
`APOLLO_OFFICE_QUALITY_PLANNER` to an already configured reviewer model. Otherwise
it uses the configured reviewer. The controller also accepts equivalent `quality_checks`
and `quality_planner` settings. This requires Python 3 and Git on a Linux worker.
It does not install dependencies or grant publication permissions.

Before reproduction the controller inspects tracked manifests, instructions,
CI definitions, available tools and relevant original source at the exact base
commit. GitHub submodule constants are requested without credentials at their
pinned gitlink revisions, with bounded sizes/timeouts. Unavailable manifests and
truncated context are reported; these are not proof that compatibility is known.
Repository contents are untrusted data, not controller instructions.

Before the first code author, a separate read-only reviewer request derives a
Python verifier from the issue, reproduction and original source. It receives no
author patch or author tests and no worker tools. The verifier is held in the
controller database, outside the author's repository. Each run gets a fresh
isolated source snapshot at an exact commit, with `APOLLO_SOURCE_ROOT` pointing at it.

The baseline must exit 1 and emit at least one named behavioral FAIL; exit 2 is
reserved for missing tools, compilation/import failures or other infrastructure
problems. Every declared check must emit exactly one `APOLLO_CHECK:name:PASS|FAIL`.
The fixed revision must exit 0 with every check PASS. Missing/duplicate results,
changed source snapshot, mismatched verifier fingerprints and malformed plans
block acceptance. A passing author test suite cannot override independent failure.
Concrete failures return to the existing repair loop and independent review.
Resume and rebase also pass this check; proof reuse requires the same candidate,
base and verifier fingerprint. A moved base triggers new inspection and a new
baseline proof. Each planner gets at most two attempts, with its concrete validation or execution diagnostic passed back. Provider failures advance immediately to the alternate configured subscription reviewer; exhausted planning ends with a diagnostic.

This is independently generated executable evidence, not a proof that the model
covered every requirement. A reviewer can still write incomplete tests, report
false expectations or miss compatibility issues. Python/JVM host tests are not
Android APK, lifecycle, persistence, network-service or real-device tests.
Result markers are not a tamper-resistant attestation against hostile code.
Model-derived scripts run as untrusted code on the already isolated worker;
this is not a hostile-code sandbox or a replacement for worker isolation.

Limits: 32 tracked file excerpts / 56 KB plus bounded dependency constants;
90-second process-group wall timeout, 16 MB per-file and 90-second per-process CPU limits, 150-second remote runner; 28 KB verifier script,
1..12 named checks and a 20 KB retained output tail. Existing job/model/worker
limits remain in force. Publication continues through the normal owner gate.

Verification:

```
python3 -m unittest discover -s quality -p 'test_*.py' -v
cargo test
```

Tests exercise committed rather than dirty manifests, symlink exclusion, pinned
submodule resolution, actual red/green code execution without changing the
author's checkout, tracked-source mutation, malformed proof rejection and a real
pipeline case where author tests pass but independent negative-value checks fail.

The runner uses isolated Python mode, a small environment allowlist and a copied
checkout whose .git directory is removed before running code. Snapshot digests
detect changed/new source files; the author checkout revision is rechecked.
