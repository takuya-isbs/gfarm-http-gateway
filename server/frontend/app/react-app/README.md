# gfarm-http-gateway webui

## Prerequisites

* Node.js v26 or later

## Install dependencies

```bash
npm ci
```

## Development

### Backend Setup Required

Before running the React app, you need the gfarm-http-gateway backend running:

1. Follow the setup instructions in the main [server/README.md](../../../README.md)
2. Start the backend server (typically on `http://localhost:8000`)

### Start Frontend Development Server

Start the React app with hot reload:

```bash
npm run start
```

The frontend will be available at `http://localhost:3000` and will proxy API requests to the backend.

### Build for Production

```bash
npm run build
```

### Lint

```bash
npm run lint      # Check code
npm run lint:fix  # Auto-fix issues
```

### End-to-End Tests (Playwright)

Install Playwright and the Chromium browser used by the standard test target:
```bash
npx playwright install --with-deps chromium
```

To run all configured browser projects, install all browsers instead:

```bash
npx playwright install --with-deps
```

Run all tests:

```bash
npm run e2e:all
```

Run in Chromium only:

```bash
npm run e2e:chromium
```

Interactive test UI:

```bash
npm run e2e:ui
```
### Update packages

Install [npm-check-updates](https://github.com/raineorshine/npm-check-updates)

```bash
# Show available updates
npx npm-check-updates

# Update package.json with latest versions
npx npm-check-updates -u

# Install and refresh package-lock.json
npm install
```

## Folder Structure

```
src/
├── components/           # Reusable UI components
│   ├── FileListView/     # File browser components (list, icon views)
│   ├── Modal/            # Modal dialogs (rename, delete, settings)
│   └── SidePanel/        # File details and permissions panel
├── page/                 # Page-level views and handlers
├── hooks/                # Custom React hooks
├── context/              # React context providers
├── utils/                # Utility functions and API helpers
├── css/                  # Component-specific stylesheets
├── App.jsx               # Main application component
└── index.jsx             # React app entry point
public/
└── assets/               # Static files (icons, logos, metadata)
```
