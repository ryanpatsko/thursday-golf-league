# AWS setup (Thursday Night Golf League)

The site reads **`league-data.json`** from S3 and writes it through a **Lambda Function URL** (password + JWT), same pattern as the Rivers of Fire project.

**Bucket name:** `thursday-golf-league`  
**Object key:** `league-data.json` (default; override on Lambda with `CMS_S3_LEAGUE_KEY` if needed)

---

## 1. S3 bucket

### Public read for `league-data.json`

Block Public Access can stay **on** if you use a bucket policy that grants `GetObject` only for this object (or prefix).

**Bucket policy** (replace the bucket name if yours differs):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadLeagueData",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::thursday-golf-league/league-data.json"
    }
  ]
}
```

**CORS** on the bucket (so browsers can `fetch` the JSON). Use your real Amplify origin(s); for preview branches you can add each hostname or use `"*"` for `AllowedOrigins` with only `GET`/`HEAD`:

```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedOrigins": [
      "https://main.YOURAPPID.amplifyapp.com",
      "http://localhost:5173"
    ],
    "ExposeHeaders": []
  }
]
```

**HTTPS URL** to remember (adjust **region** if not `us-east-1`):

`https://thursday-golf-league.s3.us-east-1.amazonaws.com/league-data.json`

If you use another region, set **`VITE_LEAGUE_DATA_URL`** in Amplify (and `.env.local`) to that full URL.

You can upload an initial file from the admin app after sign-in (**Save to S3**), or upload a JSON file once the Lambda can write.

---

## 2. Lambda (`lambda/admin-auth`)

- **Runtime:** Node.js 20.x (or 18+), handler **`index.handler`**, zip from **`npm run package:lambda`** → `dist/lambda-admin-auth.zip`.

### Environment variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `ADMIN_PASSWORD` | Yes | Shared admin password (Lambda only, not in git). |
| `ADMIN_SESSION_SECRET` | Yes | Long random string; signs JWTs (~24h sessions). |
| `CMS_S3_BUCKET` | Yes | `thursday-golf-league` |
| `CMS_S3_LEAGUE_KEY` | No | Default `league-data.json`. |

### IAM (execution role)

Allow **`s3:PutObject`** on the league JSON object (and **`s3:GetObject`** if you later read from the same key in Lambda):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:GetObject"],
      "Resource": "arn:aws:s3:::thursday-golf-league/league-data.json"
    }
  ]
}
```

### Function URL

1. Create a **Function URL** with **Auth type: NONE** (the browser sends `Authorization: Bearer …`, not IAM SigV4).
2. **CORS:** allow **GET, POST, PUT, OPTIONS**; allow headers **`content-type`**, **`authorization`**; origins = your Amplify site(s) and **`http://localhost:5173`** if you develop locally.

Rely on **Function URL CORS** in the AWS console (do not duplicate CORS headers in the Lambda response body).

**Endpoints the app uses:**

- `POST {origin}/login`
- `GET {origin}/verify`
- `PUT {origin}/league-data`

Copy the **origin** only (no path), e.g. `https://xxxxxxxx.lambda-url.us-east-1.on.aws`, into **`VITE_ADMIN_AUTH_URL`**.

---

## 3. AWS Amplify (Hosting)

**App → Environment variables:**

| Variable | Value |
|----------|--------|
| `VITE_ADMIN_AUTH_URL` | Lambda Function URL origin (no trailing slash). |
| `VITE_LEAGUE_DATA_URL` | Optional — only if the public JSON URL is not `https://thursday-golf-league.s3.us-east-1.amazonaws.com/league-data.json`. |

Trigger a **new build** after changing these (Vite inlines them at build time).

**SPA routing:** Add a **rewrite** so paths like `/admin` return **`/index.html`** with status **200** (see comment in `amplify.yml` in the Rivers of Fire repo if you use the same regex pattern).

---

## 4. Local development

1. Copy **`.env.example`** → **`.env.local`** (gitignored).
2. Set **`VITE_ADMIN_AUTH_URL`** to the same Function URL origin as production.
3. Optionally set **`VITE_LEAGUE_DATA_URL`** if your bucket/region differ from the default in code.
4. Run **`npm run dev`**.

---

## 5. Quick checklist

- [ ] Bucket **`thursday-golf-league`** exists; **`league-data.json`** is readable in a browser via HTTPS (after policy + optional upload).
- [ ] Bucket **CORS** allows your Amplify origin (and localhost if used).
- [ ] Lambda env vars set; IAM allows **PutObject** (and GetObject if needed) on **`league-data.json`**.
- [ ] Function URL exists, **auth NONE**, **CORS** allows POST/GET/PUT + **Authorization**.
- [ ] Amplify has **`VITE_ADMIN_AUTH_URL`** (and optional **`VITE_LEAGUE_DATA_URL`**); rebuild deployed.

After each save, the Lambda sets **`Cache-Control: max-age=30`** on the object to limit stale reads.
