# Resumable System setup, contract level 4 (onboarding S1a): producer captures

The real answers of the backend's `/api/system-boundary/setup*` routes at setup contract level 4: every success answer carries
`contract: system_boundary_setup/v4`. Level 4 adds the draft preview (`GET /setup/{id}/preview`) and the preview-bearing Finish
(`preview_digest`); none of these source-free setups needs a preview, so these answers are level 3's with the new tag (8 tags
differ from `../system-boundary-setup-captures-v3/`, nothing else). Each file is a byte-for-byte copy of
`tests/fixtures/system_boundary_setup_captures_v4/` at saferemediate-backend **f0facfe616532ebb822a48ce42d03d331096b1ac**
(branch claude/onboarding-s1a, local). That commit's
`tests/test_system_boundary_setup_captures.py::test_the_real_setup_route_answers_are_exactly_the_captures` asserts the mounted
routes still answer exactly these.

The level-1, level-2 and level-3 copies beside this directory are kept as those levels' evidence: this frontend refuses those
answers (SETUP_CONTRACT_UNKNOWN). The preview answers are in `../system-boundary-setup-preview-captures/`.

Never edit these by hand. Re-copy them from the backend commit that asserts them, and update the SHA above.
