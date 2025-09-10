# Gemini Code Assistant Guide

This document provides guidance for the Gemini code assistant on how to understand and interact with this project.

## Project Overview

This is a semantic image search application built with Node.js and Express. It uses the CLIP model to generate embeddings for images and text queries, allowing users to search for images based on their content and meaning, not just tags or filenames.

The application has two main parts:
1.  A web interface to upload and search for images.
2.  An API to programmatically interact with the search functionality.

A Python script (`python/api-final.py`) is likely involved in handling the machine learning (embedding generation) part of the system, which the Node.js backend communicates with.

## Getting Started

To set up the project for the first time, follow these steps:

1.  **Install Dependencies:**
    ```bash
    npm install
    ```

2.  **Set up Environment Variables:**
    Copy the `.env.example` file to a new file named `.env` and fill in the required values, especially the database connection details.
    ```bash
    # Example: copy .env.example to .env
    # You might need to manually create and edit the file.
    ```

3.  **Ensure Database is Created:**
    The application uses a MySQL database. The following command will attempt to create the necessary database and tables.
    ```bash
    npm run ensure-db
    ```

## Running the Application

-   **For production:**
    ```bash
    npm start
    ```

-   **For development (with auto-reloading):**
    ```bash
    npm run dev
    ```

The application will be available at `http://localhost:3000` (or the `PORT` specified in your `.env`).

## Application Structure

Here are the key files and directories to understand the project:

-   `app.js`: The main Express application entry point. It sets up middleware, routes, and the view engine.
-   `/bin/www`: The script that actually launches the server.
-   `/routes`: Contains the route definitions.
    -   `index.route.js`: Handles the web interface rendering.
    -   `api.route.js`: Defines the API endpoints for search, upload, etc.
-   `/controllers`: Contains the business logic for each route.
    -   `search.controller.js`: Logic for handling image search.
    -   `api.controller.js`: Logic for the API endpoints.
-   `/services`: Contains services that interact with external systems or perform complex tasks.
    -   `clip.service.js`: Interacts with the CLIP model/service.
    -   `startup.service.js`: Handles initialization tasks when the app starts.
-   `/models`: Database models and logic for interacting with the database.
-   `/python`: Contains Python scripts, likely for the machine learning backend.
    -   `api-final.py`: Probably the FastAPI/Flask server that serves the CLIP model.
-   `/public`: Static assets like CSS, JavaScript, and images.
-   `/views`: EJS templates for the web interface.

## Key Scripts

You can run these scripts using `npm run <script_name>`:

-   `start`: Starts the application in production mode.
-   `dev`: Starts the application in development mode using `nodemon` for live reloading.
-   `test`: Runs the system tests.
-   `ensure-db`: A utility script to set up the database schema.
