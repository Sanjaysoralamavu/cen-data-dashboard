# CEN Data Dashboard - Technical README

## Overview

This is a React and Vite dashboard for browsing and analyzing CEN survey responses. The app reads local JSON data, maps each survey response to a response page, computes analytics in the browser, and generates static HTML pages during build for GitHub Pages deployment.

## Tech Stack

- React
- Vite
- Plain CSS
- JSON data files
- GitHub Actions for GitHub Pages deployment

## Project Structure

- `src/main.jsx` - React app, routing, data mapping, response pages, and analytics page
- `src/styles.css` - layout, colors, responsive styling, chart bars, cards, and tables
- `src/data/responses.json` - all survey response records
- `src/data/analytics.json` - focus domain IDs and engagement matching rules
- `scripts/generate-static-pages.cjs` - creates static scrape-ready pages in `dist/`
- `extract_responses.py` - converts the source Excel file into JSON
- `.github/workflows/deploy.yaml` - builds and deploys to GitHub Pages

## Data Storage

The main data source is `src/data/responses.json`.

It stores:

- `source` - original Excel file path
- `sheet` - Excel sheet name
- `rowCount` - number of survey response records
- `headers` - list of spreadsheet columns
- `records` - array of response objects

Each record is keyed directly by the original spreadsheet column names.

Example shape:

```json
{
  "rowCount": 116,
  "headers": ["Response ID", "Activity Name", "..."],
  "records": [
    {
      "Response ID": "214410711",
      "Activity Name": "Rural, AI Offline Technology Presentation at Foster the Future Event",
      "Public Service or Community Engagement": "Community Engagement (CE) - partner is involved in research, capstone, or collaborative project work.",
      "Activity Description (Short)": "...",
      "ASU Units Involved": "...",
      "Community Organizations/Partners Involved": "...",
      "Organization Roles": "..."
    }
  ]
}
```

The second data file is `src/data/analytics.json`.

It stores:

- `categories` - focus domains such as Health, K-12, Sustainability, Aerospace/Defense, and Microelectronics
- `responseIds` - the list of response IDs assigned to each focus domain
- `engagementTypes` - engagement labels with optional role labels and regex patterns

## Data Mapping

The app creates a `byId` map from `Response ID` to the full response object. This lets the route `/214410711` open the matching response page.

Focus domains are mapped by ID membership:

- `analytics.json` defines each category
- each category has a list of `responseIds`
- `recordCategories(record)` checks whether the record response ID is in each category set

Engagement types are mapped by role and keyword matching:

- first, the app checks whether `Organization Roles` contains a configured `roleLabel`
- if no role match is found, the app applies a regex pattern against combined analytics text
- the combined text includes activity name, short description, community partners, organization roles, and outputs

## Analytics Logic

Analytics are built in `buildAnalytics(records)`.

It calculates:

- category counts
- category percentages
- engagement counts
- engagement percentages
- records inside focus domains
- records outside focus domains
- records tagged in multiple domains
- max values used to scale the visual bars

Current dataset summary:

- Total responses: 116
- Community Engagement responses: 107
- Public Service responses: 9
- In focus domains: 69
- Outside focus domains: 47
- Multi-domain records: 7

## Pages and Routing

The app uses simple pathname routing:

- `/` - response index page
- `/analytics` - analytics dashboard
- `/{Response ID}` - individual response page

The index page includes search and classification filtering.

The response page renders a structured template with these sections:

- Activity Basics
- People And Units
- Benefits And Location
- Focus
- Students And Scholarship
- Outputs And Outcomes

Some fields are displayed directly from JSON. The Programs/Initiatives field is derived by regex from activity name, description, ASU units, and organization roles.

## Static Page Generation

`npm run build` runs:

```bash
vite build && node scripts/generate-static-pages.cjs
```

The static generation script creates:

- `dist/index.html`
- `dist/analytics/index.html`
- `dist/analytics.html`
- `dist/{Response ID}/index.html`
- `dist/{Response ID}.html`
- `dist/404.html`

Each response page also receives structured JSON in a script tag with ID `cen-response-json`, which makes the built pages easier to scrape or inspect.

## Styling

All styling is in `src/styles.css`.

The design uses:

- ASU-inspired maroon `#8c1d40`
- gold accent `#ffc627`
- warm cream backgrounds
- teal active states
- bordered cards with 6px radius
- responsive grid layouts
- CSS-only count bars

The analytics bars are not chart-library charts. They are styled `div` elements whose widths are calculated from the largest count in the current group.

Responsive breakpoints:

- `820px` - main grids collapse into single-column layouts
- `560px` - stat cards and category cards become single-column

## Deployment

The GitHub Actions workflow deploys on pushes to `main`.

Deployment steps:

1. Checkout code
2. Set up Node.js 24
3. Run `npm ci`
4. Run `npm run build`
5. Upload `dist`
6. Deploy to GitHub Pages

For GitHub Pages, Vite uses this base path:

```js
/cen-data-dashboard/
```

## Local Development

Install dependencies:

```bash
npm install
```

Run locally:

```bash
npm run dev
```

Build production files:

```bash
npm run build
```

Preview the production build:

```bash
npm run preview
```

## Updating Data

`extract_responses.py` reads the Excel survey workbook and writes JSON. Before rerunning it, confirm the hardcoded `SOURCE` and `OUTPUT` paths point to the correct local files for this repository.
