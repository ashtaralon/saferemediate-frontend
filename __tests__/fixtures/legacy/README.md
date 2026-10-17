# Earlier releases' modules, frozen for compatibility tests

`system-boundary-setup-pending-1302a2e5.ts` is a byte-for-byte copy of `lib/system-boundary-setup-pending.ts` at
saferemediate-frontend **1302a2e5c63cd51649a846bf1d37a4189a2d4af4** (the frozen 0.10.12 / S0 release; blob
`git rev-parse 1302a2e5:lib/system-boundary-setup-pending.ts` equals `git hash-object` of this file). It is the pending store a
browser tab still running that release reads and settles with: the S1a tests run it against the same storage as this
release's store, so "a cached earlier-release tab never resends or settles a version-2 Finish" is exercised on its real code.

Never edit it. A later release's frozen copy is a new file named by its own commit.
