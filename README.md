# Asset Management Application

Asset Management is a full-stack web application for tracking organizational assets. It provides authenticated users with a dashboard for creating, viewing, updating, searching, and managing products and their related information.

The application is built with MongoDB, Express, React, and Node.js. Uploaded asset images and invoices are handled through Cloudinary, while QR codes can be generated for individual assets.

## Live Application

The deployed application is available at:

https://asset-4y7x.onrender.com/

### Demo Account

Use the following account to explore the deployed application:

```text
Email: pavitra@admin.com
Password: admin1234
```

This is a shared demonstration account. Do not use it for private information or production data.

## Features

- User registration and login
- JWT-based authentication using HTTP-only cookies
- Role-based access control for admins, heads, and users
- Create, view, edit, and delete assets
- Product status and warranty status tracking
- Search, filtering, sorting, and pagination
- Product image and invoice uploads
- QR code generation for assets
- User profile updates
- Department management
- Admin statistics and user management
- Responsive React dashboard

## Technology Stack

### Frontend

- React 18
- Vite
- React Router
- Axios
- Styled Components
- React Toastify
- React Icons
- React QR Code

### Backend

- Node.js
- Express
- MongoDB and Mongoose
- JSON Web Tokens
- Express Validator
- Multer
- Cloudinary

### Deployment

- Docker and Docker Compose
- Render
- MongoDB, either through the Docker Compose service or MongoDB Atlas

## Project Structure

```text
.
├── client/              React frontend
├── controllers/         Express controllers
├── errors/              Custom error classes
├── middlewares/         Authentication, validation, upload, and error middleware
├── models/              Mongoose models
├── routes/              API route definitions
├── utils/               Server utilities and shared constants
├── public/              Production frontend files
├── Dockerfile           Production server image
├── docker-compose.yml   Local MongoDB, server, and client services
├── package.json         Server scripts and dependencies
└── README.md
```

## Requirements

For local development, install:

- Node.js 20 or newer
- npm
- MongoDB, either locally or through MongoDB Atlas

Docker Desktop is required if you want to use Docker Compose.

## Environment Variables

Create a `.env` file in the project root. Use `sample.env` as a starting point:

```env
MONGO_URI=mongodb://mongo:27017/asset-management
JWT_SECRET=replace-with-a-long-random-secret
JWT_EXPIRES_IN=1d

FIREBASE_API_KEY=
FIREBASE_AUTH_DOMAIN=
FIREBASE_PROJECT_ID=
FIREBASE_STORAGE_BUCKET=
FIREBASE_MESSAGING_SENDER_ID=
FIREBASE_APP_ID=

CLOUD_NAME=
CLOUD_API_KEY=
CLOUD_SECRET=

PORT=5100
NODE_ENV=development
```

For a hosted deployment, replace `MONGO_URI` with your MongoDB Atlas connection string and set the Cloudinary values used for file uploads.

Never commit `.env` or copy real secrets into `sample.env`. The `.gitignore` file already excludes `.env`.

## Run Locally

Install the server dependencies from the repository root:

```bash
npm install
```

Install the frontend dependencies:

```bash
cd client
npm install
cd ..
```

Start MongoDB separately if you are not using Docker. Then run the backend:

```bash
npm run server
```

In a second terminal, start the frontend:

```bash
npm run client
```

The frontend runs at:

http://localhost:5173

The backend runs at:

http://localhost:5100

To run the frontend production build locally:

```bash
npm run build
```

## Run With Docker Compose

Make sure Docker Desktop is running, then execute these commands from the repository root:

```bash
docker compose up --build -d
```

The application is available at:

http://localhost:5173

The Compose stack contains:

- `mongo`: MongoDB 7 with a persistent `mongo-data` volume
- `server`: Node.js and Express API
- `client`: Nginx serving the React build and proxying `/api` requests to the server

Useful Docker commands:

```bash
docker compose ps
docker compose logs -f server
docker compose logs -f client
docker compose logs -f mongo
docker compose down
```

To remove the containers and the local MongoDB data volume:

```bash
docker compose down -v
```

The `-v` option permanently deletes the database stored by Docker Compose.

## API Overview

The API base path is `/api/v1`.

### Authentication

```text
POST /api/v1/auth/register
POST /api/v1/auth/login
GET  /api/v1/auth/logout
```

### Products

```text
GET    /api/v1/products
POST   /api/v1/products
GET    /api/v1/products/:id
PATCH  /api/v1/products/:id
DELETE /api/v1/products/:id
```

### Users

```text
GET   /api/v1/users/current-user
PATCH /api/v1/users/update-user
GET   /api/v1/users/users-list
GET   /api/v1/users/departments
GET   /api/v1/users/admin/app-stats
```

Product routes and most user routes require authentication. Creating, updating, and deleting products requires an admin or head role.

## Inspect MongoDB With Docker

Open the MongoDB shell:

```bash
docker compose exec mongo mongosh
```

Then run:

```javascript
show dbs
use asset-management
show collections
db.products.find().pretty()
db.users.find().pretty()
```

Exit the shell with:

```javascript
exit;
```

## Deployment

The current live deployment runs on Render. A production deployment needs the following configuration:

1. Create a MongoDB Atlas database.
2. Add the Render server IP or network access rule in MongoDB Atlas.
3. Set the environment variables in Render.
4. Deploy using the root `Dockerfile`.
5. Set `NODE_ENV=production`.
6. Configure Cloudinary for persistent uploaded files.

For Render, the important variables include:

```env
MONGO_URI=mongodb+srv://<username>:<password>@<cluster-url>/asset-management
JWT_SECRET=<long-random-secret>
JWT_EXPIRES_IN=1d
PORT=5100
NODE_ENV=production
CLOUD_NAME=<cloudinary-cloud-name>
CLOUD_API_KEY=<cloudinary-api-key>
CLOUD_SECRET=<cloudinary-api-secret>
```

The Docker Compose MongoDB hostname, `mongo`, only works inside the Compose network. It should not be used as the database hostname for a separate Render deployment.

## Security Notes

- Keep `.env` out of GitHub and other public repositories.
- Use a long, random value for `JWT_SECRET`.
- Rotate any secret that has been exposed publicly.
- Do not use the demo credentials for real data.
- Use MongoDB Atlas backups for hosted data.
- Use Cloudinary or another persistent storage service for uploaded files.
- Free hosting services may sleep when inactive, so the first request can take longer.

## Troubleshooting

View all service logs:

```bash
docker compose logs -f
```

Rebuild the images without using the Docker cache:

```bash
docker compose build --no-cache
docker compose up -d
```

If the frontend build reports a missing export, check `client/src/utils/constants.js`. It must export the constants used by the client, including `FIELDS`, `USER_DEPARTMENTS`, `PRODUCT_STATUS`, `WARRANTY_STATUS`, and `PRODUCT_SORT_BY`.

If the server cannot connect to MongoDB, check `MONGO_URI` and inspect the MongoDB logs:

```bash
docker compose logs mongo
```

## License

This project is intended for educational, portfolio, and demonstration use.
