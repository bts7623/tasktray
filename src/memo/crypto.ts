// 개인 메모 암호화 (D-24). 보편적 방식: AES-256-GCM + PBKDF2(SHA-256), 브라우저 표준 WebCrypto.
//
// 키 유도 입력 = 로그인 이메일(+고정 앱 상수). 비밀은 아니므로 파일 암호화는 "캐주얼 보호(난독화)"
// 수준이며, 실제 접근 통제는 메모 창의 비밀번호 게이트(Supabase 인증)가 담당한다.
// 장점: 계정 비밀번호를 바꿔도 이메일 기반 키는 그대로라 기존 메모가 깨지지 않는다.
//
// 파일 포맷(memo.enc): JSON { v, salt, iv, ct } (모두 base64). 평소 파일을 열면 암호문만 보인다.

const ITERATIONS = 150_000;
const PEPPER = "tasktray-memo-v1"; // 고정 앱 상수(비밀 아님, 도메인 분리용)

interface MemoBlob {
  v: number;
  salt: string;
  iv: string;
  ct: string;
}

function toB64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

function fromB64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function deriveKey(email: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const base = await crypto.subtle.importKey(
    "raw",
    enc.encode(`${email}|${PEPPER}`),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: ITERATIONS, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

/** 평문 메모 → 암호화된 JSON 문자열(memo.enc 내용). */
export async function encryptMemo(text: string, email: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(email, salt);
  const ctBuf = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(text),
  );
  const blob: MemoBlob = {
    v: 1,
    salt: toB64(salt),
    iv: toB64(iv),
    ct: toB64(new Uint8Array(ctBuf)),
  };
  return JSON.stringify(blob);
}

/** 암호화된 JSON 문자열 → 평문 메모. 비밀번호/이메일 불일치·손상 시 예외를 던진다. */
export async function decryptMemo(json: string, email: string): Promise<string> {
  const blob = JSON.parse(json) as MemoBlob;
  const salt = fromB64(blob.salt);
  const iv = fromB64(blob.iv);
  const key = await deriveKey(email, salt);
  const ptBuf = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, fromB64(blob.ct));
  return new TextDecoder().decode(ptBuf);
}
