import { afterEach, describe, expect, it, vi } from "vitest";
import { Transport } from "../src/transport";
import { installFakeFetch, respond } from "@uraiai/chat-test-support";

/**
 * The attachment paths were previously untestable: the shared fetch fake
 * always returned `ok: true` with only a `json()` method, so the upload
 * error branch (which reads `res.text()`) and `fetchAttachment` (which
 * reads `res.blob()`) had no coverage at all.
 */

const TOKEN = "11111111-2222-3333-4444-555555555555";
const UPLOAD = `POST /api/widget/v1/${TOKEN}/attachments/upload`;

function makeTransport() {
  return new Transport({
    baseUrl: "https://chat.example.com",
    widgetToken: TOKEN,
    widgetUserId: "visitor-1",
  });
}

function file(name = "invoice.pdf", type = "application/pdf") {
  return new File(["hello"], name, { type });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Transport.uploadAttachment", () => {
  it("returns the descriptor on success", async () => {
    const descriptor = {
      file_name: "invoice.pdf",
      mime_type: "application/pdf",
      bucket_path: "widget/abc/invoice.pdf",
    };
    installFakeFetch({ [UPLOAD]: () => descriptor });
    await expect(makeTransport().uploadAttachment(file())).resolves.toEqual(
      descriptor,
    );
  });

  it("posts multipart form data carrying the file", async () => {
    const { calls } = installFakeFetch({ [UPLOAD]: () => ({}) });
    await makeTransport().uploadAttachment(file());
    const body = calls[0].init?.body as FormData;
    expect(body).toBeInstanceOf(FormData);
    expect((body.get("file") as File).name).toBe("invoice.pdf");
  });

  // The browser has to fill in the multipart boundary itself, so this
  // is the one request that must NOT carry a content-type.
  it("sends x-widget-user-id but no content-type", async () => {
    const { calls } = installFakeFetch({ [UPLOAD]: () => ({}) });
    await makeTransport().uploadAttachment(file());
    const headers = calls[0].init?.headers as Record<string, string>;
    expect(headers["x-widget-user-id"]).toBe("visitor-1");
    expect(headers["content-type"]).toBeUndefined();
  });

  it("appends the response body to the error on failure", async () => {
    installFakeFetch({
      [UPLOAD]: () => respond({ status: 413, text: "file too large" }),
    });
    await expect(makeTransport().uploadAttachment(file())).rejects.toThrow(
      "upload failed: 413: file too large",
    );
  });

  it("still throws when the error body cannot be read", async () => {
    installFakeFetch({
      [UPLOAD]: () => respond({ status: 500, text: "" }),
    });
    await expect(makeTransport().uploadAttachment(file())).rejects.toThrow(
      "upload failed: 500",
    );
  });
});

describe("Transport.fetchAttachment", () => {
  const route = `GET /api/widget/v1/${TOKEN}/attachments/m1/a1`;

  it("returns the blob", async () => {
    const blob = new Blob(["PDF-BYTES"], { type: "application/pdf" });
    installFakeFetch({ [route]: () => respond({ blob }) });
    const got = await makeTransport().fetchAttachment("m1", "a1");
    expect(await got.text()).toBe("PDF-BYTES");
    expect(got.type).toBe("application/pdf");
  });

  // Not an <img src> / <a href>: the request needs the visitor header,
  // or one visitor could read another's files through the same widget.
  it("sends the visitor header", async () => {
    const { calls } = installFakeFetch({ [route]: () => respond({}) });
    await makeTransport().fetchAttachment("m1", "a1");
    const headers = calls[0].init?.headers as Record<string, string>;
    expect(headers["x-widget-user-id"]).toBe("visitor-1");
  });

  it("throws on a non-2xx status", async () => {
    installFakeFetch({ [route]: () => respond({ status: 404 }) });
    await expect(makeTransport().fetchAttachment("m1", "a1")).rejects.toThrow(
      "attachment fetch failed: 404",
    );
  });
});
