# 💥 Hitmaker

**Making this hits**

Hitmaker simulates web traffic. It is useful for testing anything that needs to ingest and understand web traffic (e.g. analytics, redirect services, link tracking systems) It features an interactive terminal UI, supports multiple concurrent links, and generates diverse, realistic traffic patterns.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Node](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)

## Features

- **Realistic Traffic Simulation** - Diverse user agents, locations, IPs, referers
- **Terminal UI** - Real-time dashboard with stats and controls
- **Multi-Link Support** - Test multiple URLs simultaneously
- **Unique Visitors** - Configurable IP uniqueness simulate unique users
- **Phase-Based Traffic** - Alternates between active and idle phases
- **Interactive Controls** - Navigate, pause/restart, and monitor in real-time

## Installation

### Installation

```bash
npm install -g hitmaker
```

## Quick Start

### Single URL

```bash
hitmaker https://example.com/link
```

### Multiple URLs

```bash
hitmaker https://example.com/a https://example.com/b https://example.com/c
```

### Text File with URLs

Create a text file with one URL per line:

```text
# links.txt
https://example.com/link1
https://example.com/link2
https://example.com/link3
```

Then run:

```bash
hitmaker links.txt
```

### Mix and Match

```bash
hitmaker https://example.com/direct links.txt https://example.com/another
```

## Interactive Controls

| Key | Action                        |
| --- | ----------------------------- |
| ↑/↓ | Navigate between links        |
| K   | Kill/Restart selected process |
| C   | Config                        |
| Q   | Quit all processes            |

## Configuration

Configure behavior using environment variables:

| Variable                 | Default | Description                                  |
| ------------------------ | ------- | -------------------------------------------- |
| `MIN_PER_MIN`            | 1       | Minimum hits per minute during active phase  |
| `MAX_PER_MIN`            | 100     | Maximum hits per minute during active phase  |
| `CONCURRENT`             | 1       | Number of concurrent workers per link        |
| `QR_PROB`                | 0.001   | Probability of QR code scan (0.0-1.0)        |
| `TIMEOUT_MS`             | 8000    | Request timeout in milliseconds              |
| `ACTIVE_MIN_MINUTES`     | 5       | Minimum duration of active phase             |
| `ACTIVE_MAX_MINUTES`     | 25      | Maximum duration of active phase             |
| `INACTIVITY_PROB`        | 0.5     | Probability of entering idle phase (0.0-1.0) |
| `INACTIVITY_MIN_MINUTES` | 2       | Minimum duration of idle phase               |
| `INACTIVITY_MAX_MINUTES` | 45      | Maximum duration of idle phase               |
| `UNIQUE_IP_PROB`         | 0.95    | Probability of unique IP (0.0-1.0)           |
| `METHOD`                 | GET     | HTTP method to use                           |

**Simulate returning visitors:**

```bash
UNIQUE_IP_PROB=0.5 hitmaker https://example.com/link
```

## Dashboard Layout

```
 🚀 HITMAKER  Running: 3/3 │ Total Hits: 1247

    NAME              HITS    RATE      ERRORS  URL
───────────────────────────────────────────────────────────────────────────────
▸ ● link1             512     15/min    0       https://example.com/link1
  ● link2             398     12/min    0       https://example.com/link2
  ○ link3             337     -         1       https://example.com/link3

───────────────────────────────────────────────────────────────────────────────
 Recent Output
  [link1] 2024-01-05T12:34:56.789Z W1 #512 200 New York, NY, US 8.12.34.56
  [link2] 2024-01-05T12:34:57.123Z W1 #398 200 Copenhagen, 84, DK 5.123.45.67
  [link3] 2024-01-05T12:34:58.456Z W1 #337 301 London, ENG, GB 2.234.56.78

  ↑/↓ Navigate │ K Kill/Restart │ Q Quit
```

## Status Indicators

- ● **Green (active)** - Process running and making requests
- ○ **Gray (idle)** - Process in idle/sleep phase
- ◌ **Blue (starting)** - Process initializing
- □ **Gray (stopped)** - Process killed by user
- ✗ **Red (crashed)** - Process exited with error

## Architecture

Each link runs as a separate child process for complete isolation for:

- ✅ Complete isolation - no shared state
- ✅ Stability - one crash doesn't affect others
- ✅ OS-level process management
- ✅ True concurrency

```
hitmaker (parent)
├── worker.js (child) → link1
├── worker.js (child) → link2
├── worker.js (child) → link3
└── ...
```

## Text File Format

Text files should contain one URL per line. Lines starting with `#` are treated as comments:

```text
# Production links
https://example.com/link1
https://example.com/link2

# Staging links
https://staging.example.com/test1
https://staging.example.com/test2

# This line is ignored
# https://example.com/disabled
```

## 🔧 Advanced Usage

### Programmatic Usage

You can also use Hitmaker programmatically:

```javascript
import { TrafficSimulator } from "hitmaker/simulator.js";

const simulator = new TrafficSimulator("https://example.com/link", {
  MIN_PER_MIN: 10,
  MAX_PER_MIN: 50,
  QR_PROB: 0.1,
});

await simulator.start();

// Get stats
const stats = simulator.getStats();
console.log(stats);

// Stop after 5 minutes
setTimeout(() => simulator.stop(), 5 * 60 * 1000);
```
