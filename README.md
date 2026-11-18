# Circuit Studio

This repository contains two independent Node.js projects:

- `circuit/` - Next.js frontend
- `server/` - Express, Socket.IO, Prisma, and simulation backend

Install each project independently:

```powershell
cd C:\Users\apoor\myProject\circuit\circuit
npm install
npm run dev
```

For a production build with Node.js clustering:

```powershell
cd C:\Users\apoor\myProject\circuit\server
npm run build
npm start
```

`npm start` uses sticky Socket.IO connections and starts the number of workers
configured by `CLUSTER_WORKERS` (default: 2, maximum: 8).
Use `npm run start:single` when a single production process is preferred.

## Authentication API

Configure a private JWT key in `server/.env` before starting the backend:

```env
JWT_SECRET="use-at-least-32-random-characters"
```

Register a user:

```http
POST http://localhost:4010/auth/register
Content-Type: application/json

{
  "name": "Example User",
  "email": "user@example.com",
  "password": "StrongPass123"
}
```

Login:

```http
POST http://localhost:4010/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "StrongPass123"
}
```

Both endpoints return a seven-day access token. Send it to protected endpoints:

```http
GET http://localhost:4010/auth/me
Authorization: Bearer ACCESS_TOKEN
```

After pulling schema changes, apply database migrations from `server/`:

```powershell
npx prisma migrate deploy
```

## Course API

All course routes require a bearer token and the matching course permission.
The seeded `SUPERADMIN` account has every course permission.

```text
GET    /courses
GET    /courses/:id
POST   /courses
PATCH  /courses/:id
POST   /courses/:id/publish
POST   /courses/:id/archive
DELETE /courses/:id
```

Course list query parameters:

```text
page=1
limit=20
status=ALL|DRAFT|PUBLISHED|ARCHIVED
search=robotics
```

## Role And Permission API

Role management requires a `SUPERADMIN` bearer token.

```text
GET    /roles/permissions
GET    /roles
GET    /roles/:id/permissions
GET    /roles/:id
POST   /roles
PATCH  /roles/:id
DELETE /roles/:id
PUT    /roles/:id/permissions
POST   /roles/:id/permissions/:permission
DELETE /roles/:id/permissions/:permission
POST   /roles/:id/users/:userId
DELETE /roles/:id/users/:userId
```

System roles `SUPERADMIN` and `USER` cannot be renamed or deleted. Normal users
receive the `USER` role automatically when registering. Effective permissions
are the union of direct user permissions and every assigned role permission.

## Component Guide API

Component guides support ordered text sections, uploaded image/video/GLB files,
external media URLs, and reference links.

```text
GET    /component-guides
GET    /component-guides/:idOrSlug
POST   /component-guides/media/upload
POST   /component-guides
PATCH  /component-guides/:id
DELETE /component-guides/:id
```

Upload one image, video, or `.glb` 3D model file (maximum 25 MB):

```powershell
curl.exe -X POST "http://localhost:4010/component-guides/media/upload" `
  -H "Authorization: Bearer ACCESS_TOKEN" `
  -F "file=@C:\path\to\led.png"
```

Create a guide using either the returned upload URL or an external `https` URL:

```json
{
  "name": "LED",
  "slug": "led",
  "iconUrl": "/uploads/guides/FILE_NAME.png",
  "sections": [
    { "title": "Description", "content": "This device is a light-emitting diode.", "sortOrder": 0 },
    {
      "title": "How it works",
      "content": "Current flowing in the correct direction produces light.",
      "mediaType": "VIDEO",
      "mediaUrl": "https://example.com/led-demo.mp4",
      "sortOrder": 1
    },
    {
      "title": "More information",
      "links": [{ "label": "LED tutorial", "url": "https://example.com/led" }],
      "sortOrder": 2
    }
  ]
}
```

Required role permissions are `GUIDE_VIEW`, `GUIDE_CREATE`, `GUIDE_UPDATE`, and
`GUIDE_DELETE`. The seeded `SUPERADMIN` role receives all four permissions.

## Courses API

All course endpoints require a bearer token and the matching database permission.
The seeded super admin receives every course permission.

```text
GET    /courses                 COURSE_VIEW
GET    /courses/:id             COURSE_VIEW
POST   /courses                 COURSE_CREATE
PATCH  /courses/:id             COURSE_UPDATE
POST   /courses/:id/publish     COURSE_PUBLISH
POST   /courses/:id/archive     COURSE_ARCHIVE
DELETE /courses/:id             COURSE_DELETE
```

List filters:

```text
GET /courses?status=ALL
GET /courses?status=PUBLISHED
GET /courses?status=DRAFT
GET /courses?status=ARCHIVED
GET /courses?search=robotics&page=1&limit=20
```

Create a course:

```powershell
curl.exe -X POST "http://localhost:4010/courses" `
  -H "Authorization: Bearer ACCESS_TOKEN" `
  -H "Content-Type: application/json" `
  -d '{"title":"Robotics Advanced","instructorName":"Ms. Kapoor","moduleCount":10,"icon":"R","coverColor":"#20385a"}'
```

New courses start as `DRAFT`. Publish one with:

```powershell
curl.exe -X POST "http://localhost:4010/courses/COURSE_ID/publish" `
  -H "Authorization: Bearer ACCESS_TOKEN"
```

In another terminal, run the backend:

```powershell
cd C:\Users\apoor\myProject\circuit\server
npm install
npm run dev
```
