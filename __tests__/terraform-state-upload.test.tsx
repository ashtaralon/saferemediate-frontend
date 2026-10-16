/**
 * S2 intake I2c: the upload screen (components/system-boundary/terraform-state-upload.tsx) in the contract's order (SW110):
 * disclosure BEFORE a file, the local reduction and its ACTUAL count after it, and nothing sent without the explicit
 * confirmation. The states are the backend's Terraform 1.7.1 files (__tests__/fixtures/terraform-state); the answers are the
 * binding routes' producer captures (__tests__/fixtures/terraform-binding-captures), through the REAL client. SENTINEL is a
 * fake marker, never a real secret.
 */
import { readFileSync } from "node:fs"
import path from "node:path"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { RETAINED_WORDS, TerraformStateUpload } from "@/components/system-boundary/terraform-state-upload"
import { RETAINED_FIELDS } from "@/lib/terraform-binding"

const STATES = path.join(__dirname, "fixtures", "terraform-state")
const CAPTURES = path.join(__dirname, "fixtures", "terraform-binding-captures")
const ACCOUNT = "178254216844"
const LABEL = "s3://platform-tfstate/platform.tfstate#default"
const SENTINEL = "REVIEW_FAKE_SECRET_I2C"
const RID = "00000000-0000-4000-8000-0000000f00c1"
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const capture = (name: string): any => JSON.parse(readFileSync(path.join(CAPTURES, `${name}.json`), "utf8"))
const answer = (name: string) => {
  const c = capture(name)
  return new Response(JSON.stringify(c.body), { status: c.status, headers: { "content-type": c.content_type } })
}
const stateFile = (name: string, change?: (doc: any) => void) => {           // eslint-disable-line @typescript-eslint/no-explicit-any
  const text = readFileSync(path.join(STATES, name), "utf8")
  if (!change) return new File([text], name)
  const doc = JSON.parse(text)
  change(doc)
  return new File([JSON.stringify(doc)], name)
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

async function mount(onBound = vi.fn()) {
  let n = 0                                                    // a fresh request id per upload, as crypto.randomUUID gives
  const ids = () => (n++ === 0 ? RID : `00000000-0000-4000-8000-0000000f0${String(n).padStart(3, "0")}`)
  render(<TerraformStateUpload accountId={ACCOUNT} editable onBound={onBound} requestId={ids} />)
  await act(async () => {})
  return onBound
}
/** Choose ``file``, then wait until the local reduction has answered (the count, or a named local refusal). */
async function choose(file: File) {
  fireEvent.change(screen.getByLabelText("Terraform state file"), { target: { files: [file] } })
  await waitFor(() => expect(screen.queryByTestId("terraform-confirm") ?? screen.queryByRole("alert")).not.toBeNull())
}
const typeLabel = (value = LABEL) => fireEvent.change(screen.getByLabelText("Workspace label"), { target: { value } })
async function confirmAndUpload() {
  fireEvent.click(screen.getByLabelText("I confirm this upload"))
  fireEvent.click(screen.getByRole("button", { name: "Upload" }))
  await act(async () => {})
}

describe("1. before a file: the disclosure, and nothing sent", () => {
  it("names every retained field in words, before the file chooser, with no request", async () => {
    const fetch = vi.spyOn(globalThis, "fetch")
    await mount()
    for (const field of RETAINED_FIELDS) expect(RETAINED_WORDS[field]).toBeTruthy()
    const disclosure = screen.getByTestId("terraform-disclosure")
    expect(disclosure.querySelectorAll("li")).toHaveLength(RETAINED_FIELDS.length)
    expect(disclosure.textContent).toContain("nothing here makes the upload secret-free")
    // the disclosure precedes the chooser in the document
    const chooser = screen.getByLabelText("Terraform state file")
    expect(disclosure.compareDocumentPosition(chooser) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Upload" })).toBeNull()
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe("2. after a file: the local reduction and the ACTUAL count, still nothing sent", () => {
  it.each([["aws_import.tfstate"], ["aws_import.show.json"]])("%s shows its count and waits for the confirmation", async (name) => {
    const fetch = vi.spyOn(globalThis, "fetch")
    await mount()
    typeLabel()
    await choose(stateFile(name))
    expect(screen.getByTestId("terraform-confirm").textContent)
      .toContain("3 resource(s) would be sent: 1 S3 bucket, 1 security group, 1 VPC.")
    expect((screen.getByRole("button", { name: "Upload" }) as HTMLButtonElement).disabled).toBe(true)   // not confirmed yet
    expect(fetch).not.toHaveBeenCalled()
  })

  it("says what is NOT sent: other resources, and withheld identity values", async () => {
    await mount()
    await choose(stateFile("aws_import.tfstate", (d) => {
      d.resources.push({ ...d.resources[0], type: "aws_iam_role", name: "omitted" })
      d.resources.find((r: any) => r.type === "aws_vpc").instances[0].attributes.id = { password: SENTINEL }   // eslint-disable-line @typescript-eslint/no-explicit-any
    }))
    const text = screen.getByTestId("terraform-confirm").textContent
    expect(text).toContain("1 other resource(s) in the file are not sent.")
    expect(text).toContain("1 id / ARN value(s) are withheld")
    expect(document.body.textContent).not.toContain(SENTINEL)
  })

  it.each([
    ["basic.tfstate", "NO_SUPPORTED_RESOURCES"],
    ["empty.show.json", "NO_SUPPORTED_RESOURCES"],
  ])("%s is refused locally (%s): no Upload, no request", async (name, code) => {
    const fetch = vi.spyOn(globalThis, "fetch")
    await mount()
    await choose(stateFile(name))
    expect(screen.getByRole("alert").textContent).toContain(`(${code}). Nothing was sent.`)
    expect(screen.queryByRole("button", { name: "Upload" })).toBeNull()
    expect(fetch).not.toHaveBeenCalled()
  })

  it("a file over the read bound is refused by its size alone -- never read", async () => {
    await mount()
    const big = new File([new Uint8Array(32 * 1024 * 1024 + 1)], "huge.tfstate")
    const read = vi.spyOn(big, "arrayBuffer")
    await choose(big)
    expect(screen.getByRole("alert").textContent).toContain("(FILE_TOO_LARGE). Nothing was sent.")
    expect(read).not.toHaveBeenCalled()
  })

  it("a malformed file is refused by its code, never echoed", async () => {
    await mount()
    await choose(stateFile("aws_import.tfstate", (d) => { d.lineage = SENTINEL }))
    expect(screen.getByRole("alert").textContent).toContain("(LINEAGE_INVALID). Nothing was sent.")
    expect(document.body.textContent).not.toContain(SENTINEL)
  })

  it("an invalid workspace label keeps Upload disabled, even confirmed", async () => {
    await mount()
    typeLabel(" leading-space")
    await choose(stateFile("aws_import.tfstate"))
    fireEvent.click(screen.getByLabelText("I confirm this upload"))
    expect((screen.getByRole("button", { name: "Upload" }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText("A workspace label has no leading or trailing spaces.")).toBeTruthy()
  })
})

describe("3. the explicit confirmation sends exactly the reduced envelope, once", () => {
  it("sends the reduction for this account and label, and reports the binding", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(answer("create"))
    const onBound = await mount()
    typeLabel()
    await choose(stateFile("aws_import.tfstate"))
    await confirmAndUpload()
    expect(fetch).toHaveBeenCalledTimes(1)
    const sent = JSON.parse((fetch.mock.calls[0][1] as RequestInit).body as string)
    expect([sent.request_id, sent.account_id, sent.workspace_identity, sent.format, sent.consent])
      .toEqual([RID, ACCOUNT, LABEL, "raw_state_v4", { text_version: "terraform_reduced_upload_consent/v1", confirmed: true }])
    expect(JSON.parse(sent.document).resources).toHaveLength(3)
    expect(onBound).toHaveBeenCalledWith(expect.objectContaining({ binding_id: capture("create").body.binding_id, revision: 1 }))
  })

  it("a withheld value never leaves the browser through the screen", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(answer("create"))
    await mount()
    typeLabel()
    await choose(stateFile("aws_import.tfstate", (d) => {
      const vpc = d.resources.find((r: any) => r.type === "aws_vpc").instances[0]   // eslint-disable-line @typescript-eslint/no-explicit-any
      vpc.attributes.id = `vpc-${SENTINEL}`
      vpc.sensitive_attributes = [[{ type: "get_attr", value: "id" }]]
    }))
    await confirmAndUpload()
    expect((fetch.mock.calls[0][1] as RequestInit).body as string).not.toContain(SENTINEL)
  })
})

describe("outcomes: never resent on its own", () => {
  it("an ended session says sign in again, sends nothing more", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({ type: "opaqueredirect", status: 0, headers: new Headers() } as unknown as Response)
    const onBound = await mount()
    typeLabel()
    await choose(stateFile("aws_import.tfstate"))
    await confirmAndUpload()
    expect(screen.getByRole("alert").textContent).toContain("Sign in again, then choose the file again")
    expect(screen.queryByRole("button", { name: "Send the same upload again" })).toBeNull()
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(onBound).not.toHaveBeenCalled()
  })

  it("a named refusal is said by code; nothing is resent", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(answer("credential_shaped"))
    await mount()
    typeLabel()
    await choose(stateFile("aws_import.tfstate"))
    await confirmAndUpload()
    expect(screen.getByRole("alert").textContent).toContain("(STATE_VALUE_CREDENTIAL_SHAPED). Nothing was stored.")
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it("an unknown outcome offers the SAME upload again -- only when clicked -- and it replays", async () => {
    const fetch = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ detail: { code: "AUTHORING_BACKEND_UNAVAILABLE" } }),
                                          { status: 502, headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(answer("create_replay"))
    const onBound = await mount()
    typeLabel()
    await choose(stateFile("aws_import.tfstate"))
    await confirmAndUpload()
    expect(screen.getByRole("alert").textContent).toContain("(AUTHORING_BACKEND_UNAVAILABLE)")
    expect(fetch).toHaveBeenCalledTimes(1)                                          // not resent on its own
    const sentLabel = () => JSON.parse((fetch.mock.calls[0][1] as RequestInit).body as string).workspace_identity
    // (SW114 R2) the label shown is the one SENT, and the field cannot drift from it while the outcome is unknown
    expect(screen.getByTestId("terraform-label-shown").textContent).toBe(`Workspace label sent with it: "${sentLabel()}".`)
    typeLabel("changed-after-the-fact")
    expect((screen.getByLabelText("Workspace label") as HTMLInputElement).value).toBe(sentLabel())
    expect(screen.getByTestId("terraform-label-shown").textContent).toBe(`Workspace label sent with it: "${sentLabel()}".`)
    fireEvent.click(screen.getByRole("button", { name: "Send the same upload again" }))
    await act(async () => {})
    expect(fetch).toHaveBeenCalledTimes(2)
    const [first, second] = fetch.mock.calls.map((c) => (c[1] as RequestInit).body)
    expect(second).toBe(first)
    expect(onBound).toHaveBeenCalledWith(expect.objectContaining({ replayed: true }))
  })

  it("SW114 R2: a label changed after the confirmation needs it again; the label shown is the one sent", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(answer("create"))
    await mount()
    typeLabel()
    await choose(stateFile("aws_import.tfstate"))
    fireEvent.click(screen.getByLabelText("I confirm this upload"))
    typeLabel("s3://platform-tfstate/other.tfstate#default")
    expect((screen.getByLabelText("I confirm this upload") as HTMLInputElement).checked).toBe(false)
    expect((screen.getByRole("button", { name: "Upload" }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByTestId("terraform-label-shown").textContent)
      .toBe('Workspace label to send with it: "s3://platform-tfstate/other.tfstate#default".')
    await confirmAndUpload()
    expect(JSON.parse((fetch.mock.calls[0][1] as RequestInit).body as string).workspace_identity)
      .toBe("s3://platform-tfstate/other.tfstate#default")
  })

  it("SW114 R1: an answer arriving after the screen closed calls nothing", async () => {
    let release!: () => void
    const gate = new Promise<void>((r) => { release = r })
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => { await gate; return answer("create") })
    const onBound = await mount()
    typeLabel()
    await choose(stateFile("aws_import.tfstate"))
    await confirmAndUpload()
    cleanup()
    release()
    await act(async () => { await new Promise((r) => setTimeout(r, 0)) })
    expect(onBound).not.toHaveBeenCalled()
  })

  it("SW114 R1: after choosing another file while uploading, that upload's late answer calls nothing", async () => {
    let release!: () => void
    const gate = new Promise<void>((r) => { release = r })
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => { await gate; return answer("create") })
    const onBound = await mount()
    typeLabel()
    await choose(stateFile("aws_import.tfstate"))
    await confirmAndUpload()                                                       // in flight
    fireEvent.click(screen.getByRole("button", { name: "Choose another file" }))   // the person stops waiting
    release()
    await act(async () => { await new Promise((r) => setTimeout(r, 0)) })
    expect(onBound).not.toHaveBeenCalled()
    expect(screen.getByLabelText("Terraform state file")).toBeTruthy()
  })
})
