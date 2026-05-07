# R-19-A: Foundation — `gpt-tokenizer` + `S3StorageClient.getObjectBuffer`

> **For agentic workers:** Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Install the tokenizer package and expose a buffer-download method on storage — two infrastructure prerequisites that unblock the rest of R-19.

**Prerequisites:** None. Must complete before 03b, 03c, 03d, 03e, 03f.

---

## File Map

| Action | Path                                        |
| ------ | ------------------------------------------- |
| Modify | `packages/storage/src/s3-storage-client.ts` |
| Auto   | `apps/api/package.json` (bun add)           |
| Auto   | `bun.lock`                                  |

---

## Task 1: Install `gpt-tokenizer` in the API app

- [ ] **Step 1.1: Install the package**

  ```bash
  bun add gpt-tokenizer --filter apps/api
  ```

- [ ] **Step 1.2: Verify it appears in `apps/api/package.json` under `dependencies`**

  ```bash
  grep "gpt-tokenizer" apps/api/package.json
  ```

---

## Task 2: Add `getObjectBuffer` to `S3StorageClient`

- [ ] **Step 2.1: Add the method**

  In `packages/storage/src/s3-storage-client.ts`, after the `putObject` method, add:

  ```typescript
  async getObjectBuffer(key: string): Promise<Buffer> {
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: key })
    const response = await this.s3.send(command)
    if (!response.Body) throw new Error(`S3StorageClient: empty body for key ${key}`)
    const chunks: Uint8Array[] = []
    for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
      chunks.push(chunk)
    }
    return Buffer.concat(chunks)
  }
  ```

  Confirm `GetObjectCommand` is already imported (it is used by `getDownloadUrl`). If not, add it to the AWS SDK import line.

- [ ] **Step 2.2: Rebuild the storage package**

  ```bash
  bun run --filter @future/storage build
  ```

---

## Task 3: Commit

- [ ] **Step 3.1: Commit**

  ```bash
  git add packages/storage/src/s3-storage-client.ts apps/api/package.json bun.lock
  git commit -m "feat(storage): add getObjectBuffer to S3StorageClient"
  ```
