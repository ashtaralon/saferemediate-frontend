"use client"

/**
 * S2 intake I2c: upload ONE Terraform state as a workspace binding -- the person's side of contract
 * S2-INTAKE-CONTRACT-2026-10-16 section 4 (Alon chose browser-side reduction, SW108). The order is fixed (SW110):
 *  1. BEFORE a file is chosen, what is kept (section 3) is disclosed -- generated from ``RETAINED_FIELDS``, the very list the
 *     record stores, so the words cannot drift from it;
 *  2. after the file is chosen, it is validated and reduced HERE (lib/terraform-state-reducer.ts), and the ACTUAL count of
 *     what would be sent is shown -- a count cannot exist before a file;
 *  3. only an explicit confirmation of that count and that disclosure sends anything.
 * Nothing is sent before step 3, and nothing is ever resent on its own: an ended session says "sign in again"; an answer this
 * screen cannot read offers the SAME upload again (its request id makes the server answer a replay), only when clicked.
 * Refusals are named by code; nothing of the file is shown back except the counts.
 */
import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { createTerraformBinding, RETAINED_FIELDS, type BindingAnswer, type BindingCreated } from "@/lib/terraform-binding"
import {
  buildEnvelope,
  MAX_ENVELOPE_BYTES,
  MAX_FILE_BYTES,
  reduceTerraformState,
  ReductionRefused,
  type Reduction,
} from "@/lib/terraform-state-reducer"

/** Every retained field, in words (contract section 3). A field without words fails the test that covers this list. */
export const RETAINED_WORDS: Record<string, string> = {
  "state.lineage": "the state's lineage",
  "state.serial": "its serial",
  "state.terraform_version": "the Terraform version that wrote it",
  "state.format_version": "its format version (terraform show -json output)",
  "resource.module_path": "for each kept resource: its module path",
  "resource.mode": "its mode",
  "resource.type": "its type",
  "resource.name": "its name",
  "resource.index_key": "its index key",
  "resource.provider_source": "its provider source",
  "resource.status": "its status (tainted)",
  "resource.deposed_key": "its deposed key",
  "resource.schema_version": "its schema version",
  "resource.id": "its id, only when it is text the state does not mark sensitive",
  "resource.arn": "its ARN, only when it is text the state does not mark sensitive",
  "resource.sensitivity_marks": "the sensitivity marks on its id and ARN",
  workspace_identity: "the workspace label you type below",
  claimed_source_digest: "a SHA-256 digest of the original file (a claim, never proof)",
  "consent.confirmed_by": "who confirmed this upload",
  "consent.confirmed_at": "and when",
}

const TYPE_WORDS: Record<string, string> = { aws_vpc: "VPC", aws_security_group: "security group", aws_s3_bucket: "S3 bucket" }

/** A local refusal (nothing was sent), in words, with its code. */
const LOCAL_WORDS: Record<string, string> = {
  FILE_TOO_LARGE: `The file is over ${MAX_FILE_BYTES / 1024 / 1024} MiB`,
  NO_SUPPORTED_RESOURCES: "The file has no Terraform-managed AWS VPC, security group or S3 bucket, so there is nothing to send",
  ENVELOPE_TOO_LARGE: `Even reduced, the upload is over ${MAX_ENVELOPE_BYTES / 1024 / 1024} MiB`,
  UNSUPPORTED_FORMAT: "This is neither a Terraform state (version 4) nor terraform show -json output",
  UNSUPPORTED_STATE_VERSION: "This Terraform state is not version 4",
  UNSUPPORTED_FORMAT_VERSION: "This terraform show -json output is of a format version this release does not read",
}
const localSentence = (code: string) =>
  `${LOCAL_WORDS[code] ?? "The file is not a well-formed Terraform state"} (${code}). Nothing was sent.`

/** A server refusal, in words, with its code (and fixed reason). Nothing was stored. */
const REFUSED_WORDS: Record<string, string> = {
  STATE_VALUE_CREDENTIAL_SHAPED: "A kept name, key, id or ARN looks like a credential, so the upload was refused",
  STATE_NOT_ADMISSIBLE: "The server could not admit the reduced state",
  REDUCTION_INVALID: "The reduced state is not what this browser sends",
  CONSENT_REQUIRED: "The upload was not confirmed",
  REQUEST_BODY_TOO_LARGE: "The upload is over the 1 MiB limit",
  ACCOUNT_NOT_REGISTERED: "This account is not registered",
  ACCOUNT_NOT_OPEN: "This account is not open for setup",
  ACCOUNT_NOT_IN_SCOPE: "The state names an account you may not see",
  PERSON_NOT_AUTHORIZED: "You may not create bindings",
  NO_GRANT: "You have no grant for this account",
  OUT_OF_SCOPE: "This account is outside your grant",
  GRANT_CHANGED: "Your grant changed while uploading",
  ACCOUNT_AUTHORITY_CHANGED: "The account's registration changed while uploading",
  REQUEST_ID_REUSED: "This upload's request was already used for another one",
  REQUEST_ID_CONFLICT: "This upload's request belongs to someone else",
}
const refusedSentence = (code: string, reason: string | null) =>
  `${REFUSED_WORDS[code] ?? "The upload was refused"} (${code}${reason ? `: ${reason}` : ""}). Nothing was stored.`

/** The backend's workspace-label rule (C3a ``_workspace_identity_ok``): printable ASCII, 1-256, no outer spaces. */
export function labelProblem(label: string): string | null {
  if (!label) return "Name this workspace (for example s3://bucket/key#workspace)."
  if (label.length > 256) return "A workspace label is at most 256 characters."
  if (!/^[\x20-\x7e]*$/.test(label)) return "A workspace label is plain printable text (ASCII)."
  if (label !== label.trim()) return "A workspace label has no leading or trailing spaces."
  return null
}

type Phase =
  | { at: "choose"; problem: string | null }
  | { at: "reading" }
  | { at: "confirm"; reduction: Reduction }
  | { at: "sending"; reduction: Reduction; body: string; label: string }
  | { at: "unknown"; reduction: Reduction; body: string; label: string; code: string }
  | { at: "refused"; sentence: string }
  | { at: "sign_in" }

export function TerraformStateUpload({ accountId, editable, onBound, create = createTerraformBinding, requestId = () => crypto.randomUUID() }: {
  /** The bound account: every binding is of exactly one. */
  accountId: string
  editable: boolean
  onBound: (created: BindingCreated) => void
  /** The binding client (the real one unless a test names another). */
  create?: (body: string) => Promise<BindingAnswer<BindingCreated>>
  requestId?: () => string
}) {
  const [label, setLabel] = useState("")
  const [phase, setPhase] = useState<Phase>({ at: "choose", problem: null })
  const [confirmed, setConfirmed] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  // (SW114 R1) An answer is acted on only by the instance that sent it, for its LATEST upload: one that arrives after this
  // screen closed (the row changed or was removed, the step or the wizard left) or after "start over" changes nothing.
  const generation = useRef(0)
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => { alive.current = false }
  }, [])

  const choose = async (file: File | undefined) => {
    setConfirmed(false)
    if (!file) return
    if (file.size > MAX_FILE_BYTES) return setPhase({ at: "choose", problem: localSentence("FILE_TOO_LARGE") })   // never read
    setPhase({ at: "reading" })
    try {
      setPhase({ at: "confirm", reduction: await reduceTerraformState(new Uint8Array(await file.arrayBuffer())) })
    } catch (e) {
      setPhase({ at: "choose", problem: localSentence(e instanceof ReductionRefused ? e.code : "NOT_READABLE") })
    }
  }
  const again = () => {
    generation.current += 1                                     // an upload still in flight no longer speaks for this screen
    setConfirmed(false)
    setPhase({ at: "choose", problem: null })
    if (input.current) input.current.value = ""
  }
  /** Send ``reduction`` -- or, resending, EXACTLY the ``kept`` body and the label it carries (SW114 R2: what is shown is what
   *  was sent, never the field as edited since). */
  const send = async (reduction: Reduction, kept?: { body: string; label: string }) => {
    let pending = kept
    if (pending === undefined) {
      try {
        pending = { body: buildEnvelope({ requestId: requestId(), accountId, workspaceIdentity: label, reduction }).body, label }
      } catch (e) {
        return setPhase({ at: "choose", problem: localSentence(e instanceof ReductionRefused ? e.code : "NOT_READABLE") })
      }
    }
    const mine = ++generation.current
    setPhase({ at: "sending", reduction, ...pending })
    const answer = await create(pending.body)
    if (!alive.current || mine !== generation.current) return   // detached or superseded: this answer changes nothing here
    if (answer.kind === "OK") return onBound(answer.value)
    if (answer.kind === "SIGN_IN_AGAIN") return setPhase({ at: "sign_in" })
    if (answer.kind === "REFUSED") return setPhase({ at: "refused", sentence: refusedSentence(answer.code, answer.reason) })
    setPhase({ at: "unknown", reduction, ...pending, code: answer.code })
  }
  /** (SW114 R2) The label as typed, before anything is sent: a change after the confirmation needs it again. Once sent (in
   *  flight, or its outcome unknown) what is SHOWN is the sent one (``frozen``), whatever the field held since. */
  const frozen = phase.at === "sending" || phase.at === "unknown"
  const edit = (value: string) => {
    setLabel(value)
    setConfirmed(false)
  }

  const labelIssue = labelProblem(label)
  return (
    <div className="mt-2 space-y-2 rounded border border-slate-200 p-2 text-xs" data-testid="terraform-upload">
      <div data-testid="terraform-disclosure">
        <p className="font-medium">Use a Terraform state, reduced in this browser</p>
        <p>The file is read and reduced here, in your browser. Only this leaves it:</p>
        <ul className="list-disc pl-5">
          {RETAINED_FIELDS.map((field) => <li key={field}>{RETAINED_WORDS[field] ?? field}</li>)}
        </ul>
        <p>Kept only for AWS VPCs, security groups and S3 buckets that Terraform manages. The file itself and everything else in it --
          every other resource, attribute, output and value -- is not sent.</p>
        <p>Names, keys, ids and ARNs are sent exactly as written and may contain anything your workspace put there: nothing here
          makes the upload secret-free. What is uploaded is a snapshot Cyntro assesses, not a connection.</p>
      </div>
      <label className="block">
        <span>Workspace label</span>
        <input className="ml-2 rounded border px-2 py-1" value={frozen ? phase.label : label} disabled={!editable || frozen}
          onChange={(e) => edit(e.target.value)} aria-label="Workspace label" placeholder="s3://bucket/key#workspace" />
      </label>
      {label && labelIssue ? <p className="text-amber-800">{labelIssue}</p> : null}
      {phase.at === "choose" || phase.at === "reading" ? (
        <label className="block">
          <span>Terraform state file (.tfstate, or terraform show -json output)</span>
          <input ref={input} type="file" className="ml-2" accept=".tfstate,.json,application/json" disabled={!editable || phase.at === "reading"}
            aria-label="Terraform state file" onChange={(e) => void choose(e.target.files?.[0])} />
        </label>
      ) : null}
      {phase.at === "reading" ? <p>Reading and reducing the file here…</p> : null}
      {phase.at === "choose" && phase.problem ? <p role="alert" className="text-red-700">{phase.problem}</p> : null}
      {phase.at === "confirm" || phase.at === "sending" || phase.at === "unknown" ? (
        <div data-testid="terraform-confirm" className="space-y-1">
          <p>{countSentence(phase.reduction)}</p>
          <p data-testid="terraform-label-shown">
            {frozen ? `Workspace label sent with it: "${phase.label}".` : `Workspace label to send with it: ${label ? `"${label}"` : "none yet"}.`}
          </p>
          {phase.at === "unknown" ? (
            <>
              <p role="alert" className="text-amber-800">
                Whether the upload was stored is not known ({phase.code}). Sending the same upload again is safe: it can only ever
                be stored once.
              </p>
              <Button type="button" size="sm" disabled={!editable} onClick={() => void send(phase.reduction, { body: phase.body, label: phase.label })}>
                Send the same upload again
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={again}>Start over</Button>
            </>
          ) : (
            <>
              <label className="block">
                <input type="checkbox" checked={confirmed} disabled={!editable || phase.at === "sending"}
                  onChange={(e) => setConfirmed(e.target.checked)} aria-label="I confirm this upload" />
                <span className="ml-1">I have read what is kept and confirm uploading exactly these {phase.reduction.resourceCount} resource(s).</span>
              </label>
              <Button type="button" size="sm" disabled={!editable || !confirmed || labelIssue !== null || phase.at === "sending"}
                onClick={() => void send(phase.reduction)}>
                {phase.at === "sending" ? "Uploading…" : "Upload"}
              </Button>
              {/* (SW114 R1) also while uploading: the person may stop waiting -- that upload's late answer then changes nothing
                  here (a binding it may have stored stays unused until revoked) */}
              <Button type="button" size="sm" variant="outline" onClick={again}>Choose another file</Button>
            </>
          )}
        </div>
      ) : null}
      {phase.at === "refused" ? (
        <>
          <p role="alert" className="text-red-700">{phase.sentence}</p>
          <Button type="button" size="sm" variant="outline" onClick={again}>Choose another file</Button>
        </>
      ) : null}
      {phase.at === "sign_in" ? (
        <>
          <p role="alert" className="text-amber-800">
            Your session ended, so nothing was sent on. Sign in again, then choose the file again: it is never resent on its own.
          </p>
          <Button type="button" size="sm" onClick={() => window.location.reload()}>Sign in again</Button>
        </>
      ) : null}
    </div>
  )
}

/** The ACTUAL count of what would be sent, from the reduction of the chosen file. */
export function countSentence(r: Reduction): string {
  const kinds = Object.entries(r.byType).sort().map(([type, n]) => `${n} ${TYPE_WORDS[type] ?? type}${n === 1 ? "" : "s"}`)
  const omitted = r.omittedCount ? ` ${r.omittedCount} other resource(s) in the file are not sent.` : ""
  const withheld = r.withheldValueCount ? ` ${r.withheldValueCount} id / ARN value(s) are withheld: marked sensitive, or not text.` : ""
  return `${r.resourceCount} resource(s) would be sent: ${kinds.join(", ")}.${omitted}${withheld}`
}
