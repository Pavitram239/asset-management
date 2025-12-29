# 🔧 Asset Management Application (MERN Stack)

A full-stack asset management web application built with the **MERN stack (MongoDB, Express, React, Node.js)**.  
This project demonstrates real-world CRUD operations, role-based workflows, and intuitive UI interactions — a solid example of a production-style application.

---

## 🚀 Project Overview

This application helps users manage assets securely and efficiently.  
It includes features such as:
- Adding, viewing, updating, and deleting assets
- Backend APIs for asset data management
- Frontend dashboard built with React
- Persistent storage with MongoDB

It's built end-to-end using JavaScript technologies and follows common industry patterns for full-stack applications. :contentReference[oaicite:1]{index=1}

---

## 🧠 Motivation

I built this project to solve the problem of managing organizational assets (like equipment, tools, inventory) through a web interface backed by REST APIs.  
It helped me strengthen skills in:
- Building APIs with Express.js  
- State-driven UI design with React  
- Database schema design with MongoDB  
- Connecting frontend with backend using fetch / axios

This project serves as a solid technical example for full-stack development workflows.

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React |
| Backend | Node.js + Express |
| Database | MongoDB |
| Styling | CSS / Tailwind (if used) |
| Deployment | (Local or any Cloud platform) |

---

## 📦 Features

- 🆕 Create and store asset records  
- 📖 Read and list all assets  
- ✏️ Update asset details  
- 🗑️ Delete unwanted assets  
- 🧩 Modular API routes  
- 📡 Frontend connected with backend via REST APIs

---

## 🏁 Getting Started

### Prerequisites
Before you begin, make sure you have installed:
- Node.js (v14+)
- npm or yarn
- MongoDB running locally or on cloud

---

### Installation & Setup

1. **Clone the repository**
    ```bash
    git clone https://github.com/Pavitram239/Asset-MERN.git
    cd Asset-MERN
    ```

2. **Install dependencies**
    ```bash
    npm install
    ```

3. **Start MongoDB**
    ```bash
    # if installed locally
    sudo service mongod start
    ```

4. **Run backend**
    ```bash
    cd backend
    npm start
    ```

5. **Run frontend**
    ```bash
    cd frontend
    npm start
    ```

Your app should now be running locally (e.g., `http://localhost:3000`).

---

## ⛏️ Project Structure

Asset-MERN/
├── backend/ — Express API
├── frontend/ — React app
├── .gitignore
├── package.json
└── README.md

