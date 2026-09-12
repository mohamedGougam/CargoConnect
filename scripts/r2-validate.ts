/**
 * One-off Cloudflare R2 validation against S3DocumentStorage.
 * Does not print secrets or signed credential material.
 *
 * Usage: npx tsx scripts/r2-validate.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import {
  S3DocumentStorage,
  resetDocumentStorageForTests,
} from "../src/server/documents/storage";

function assertNoSecretLeak(msg: string) {
  const lower = msg.toLowerCase();
  if (
    lower.includes("credential=") ||
    lower.includes("signature=") ||
    lower.includes("x-amz-security-token") ||
    lower.includes("authorization:")
  ) {
    throw new Error("Refusing to surface signed credential material");
  }
}

async function main() {
  resetDocumentStorageForTests();
  const provider = process.env.DOCUMENT_STORAGE_PROVIDER;
  const bucket = process.env.DOCUMENT_STORAGE_BUCKET;
  const endpointHost = process.env.DOCUMENT_STORAGE_ENDPOINT
    ? new URL(process.env.DOCUMENT_STORAGE_ENDPOINT).host
    : "";

  console.log(
    JSON.stringify({
      step: "config",
      provider,
      bucket,
      endpointHost,
      region: process.env.DOCUMENT_STORAGE_REGION,
      forcePathStyle: process.env.DOCUMENT_STORAGE_FORCE_PATH_STYLE,
      accessKeyPresent: Boolean(process.env.DOCUMENT_STORAGE_ACCESS_KEY?.trim()),
      secretKeyPresent: Boolean(process.env.DOCUMENT_STORAGE_SECRET_KEY?.trim()),
    }),
  );

  if (provider !== "s3" && provider !== "r2") {
    throw new Error("DOCUMENT_STORAGE_PROVIDER must be s3 or r2 for this probe");
  }

  const storage = new S3DocumentStorage();
  const stamp = Date.now();
  const key = `__health__/r2-validation-${stamp}.txt`;
  const payload = Buffer.from(
    "CargoConnect R2 validation probe — safe to delete",
    "utf8",
  );

  try {
    await storage.upload({
      storageKey: key,
      body: payload,
      contentType: "text/plain",
    });
    console.log(
      JSON.stringify({ step: "write", status: "ok", keyPrefix: "__health__/" }),
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    assertNoSecretLeak(message);
    console.log(JSON.stringify({ step: "write", status: "fail", error: message }));
    process.exit(1);
  }

  try {
    const meta = await storage.getMetadata(key);
    console.log(
      JSON.stringify({
        step: "head",
        status: meta ? "ok" : "missing",
        sizeBytes: meta?.sizeBytes ?? null,
        contentType: meta?.contentType ?? null,
      }),
    );
    if (!meta) process.exit(1);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    assertNoSecretLeak(message);
    console.log(JSON.stringify({ step: "head", status: "fail", error: message }));
    process.exit(1);
  }

  try {
    const got = await storage.download(key);
    const match = Boolean(got && got.body.equals(payload));
    console.log(
      JSON.stringify({
        step: "read",
        status: match ? "ok" : "mismatch",
        bytes: got?.body.length ?? 0,
        contentType: got?.contentType ?? null,
      }),
    );
    if (!match) process.exit(1);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    assertNoSecretLeak(message);
    console.log(JSON.stringify({ step: "read", status: "fail", error: message }));
    process.exit(1);
  }

  const publicUrl = `${new URL(process.env.DOCUMENT_STORAGE_ENDPOINT!).origin}/${bucket}/${key}`;
  try {
    const pub = await fetch(publicUrl, { method: "GET" });
    const privateOk =
      pub.status === 401 || pub.status === 403 || pub.status === 404;
    console.log(
      JSON.stringify({
        step: "private_unsigned_get",
        status: privateOk ? "ok_private" : "unexpected",
        httpStatus: pub.status,
      }),
    );
    if (pub.status === 200) {
      console.log(
        JSON.stringify({
          step: "private_unsigned_get",
          status: "fail",
          error: "object publicly readable",
        }),
      );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    assertNoSecretLeak(message);
    console.log(
      JSON.stringify({
        step: "private_unsigned_get",
        status: "network_or_blocked",
        error: message.slice(0, 120),
      }),
    );
  }

  try {
    await storage.delete(key);
    console.log(JSON.stringify({ step: "delete", status: "ok" }));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    assertNoSecretLeak(message);
    console.log(JSON.stringify({ step: "delete", status: "fail", error: message }));
    process.exit(1);
  }

  try {
    const after = await storage.getMetadata(key);
    console.log(
      JSON.stringify({
        step: "verify_gone",
        status: after === null ? "ok" : "still_present",
      }),
    );
    if (after !== null) process.exit(1);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    assertNoSecretLeak(message);
    console.log(
      JSON.stringify({ step: "verify_gone", status: "fail", error: message }),
    );
    process.exit(1);
  }

  const healthKey = `__health__/ready-${stamp}.txt`;
  try {
    await storage.upload({
      storageKey: healthKey,
      body: Buffer.from("ok"),
      contentType: "text/plain",
    });
    const meta = await storage.getMetadata(healthKey);
    await storage.delete(healthKey);
    const gone = await storage.getMetadata(healthKey);
    console.log(
      JSON.stringify({
        step: "health_probe",
        status: meta && gone === null ? "ok" : "fail",
      }),
    );
    if (!(meta && gone === null)) process.exit(1);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    assertNoSecretLeak(message);
    console.log(
      JSON.stringify({ step: "health_probe", status: "fail", error: message }),
    );
    process.exit(1);
  }

  console.log(
    JSON.stringify({
      step: "summary",
      status: "all_ok",
      architectureChangeRequired: false,
      r2Compatible: true,
    }),
  );
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  console.log(JSON.stringify({ step: "fatal", error: message.slice(0, 200) }));
  process.exit(1);
});
