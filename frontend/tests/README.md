# Running Tests Locally

This guide will show you how to run tests locally for a frontend application using `yarn start` and `npx playwright test`.

## Prerequisites

Before getting started, you should have the following installed on your computer:

- Node.js
- Yarn

## Step 1: Clone the repository

Begin by cloning the repository to your local machine.

`git clone git@github.com:webrecorder/browsertrix-cloud.git`

## Step 2: Change directory to frontend

Navigate to the frontend directory:

`cd frontend`

## Step 3: Install dependencies

Install the project's dependencies:

`yarn install`

## Step 4: Add `.env`

Add a `.env` file by copying the sample:

`cp sample.env.local .env`

## Step 5: Start the application

Start the application:

`yarn start`

This will open the application in your browser at `http://localhost:5173`.

## Step 5: Open a new terminal tab

Open a new terminal tab so that the first one continues to run the application.

## Step 6: Run tests

Run the tests in the new terminal tab using `npx playwright test`.

This will run the tests and output the results in the terminal.
