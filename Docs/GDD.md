# Hoops - Game Design Document

> *Set a high score in this arcade-style basketball shooter.*

## Overview

**Hoops** is a browser-based arcade basketball shooting game inspired by real-world Pop-A-Shot machines and mobile titles like Flick Basketball and Basketball Kings. Players swipe/flick to throw basketballs down a neon-lit lane into a hoop, chasing target scores across escalating stages under time pressure. The game captures the satisfying rhythm of arcade basketball with modern visual flair — fire effects, streak counters, neon lighting, and a dark arena atmosphere.

Built with HTML5 Canvas and vanilla JavaScript. Hosted on Vercel.

---

## Core Gameplay

### The Loop

1. Ball appears at the bottom of the lane (first-person perspective)
2. Player swipes/flicks upward to throw
3. Ball arcs toward the hoop following physics-based trajectory
4. Score on make, streak builds on consecutive makes
5. Reach the target score before time runs out to advance
6. Repeat with increased difficulty each stage

### Controls

| Platform | Action | Input |
|----------|--------|-------|
| Mobile | Throw ball | Swipe/flick upward on ball |
| Mobile | Aim | Swipe direction determines lateral aim |
| Desktop | Throw ball | Click and drag upward, release to throw |
| Desktop | Aim | Mouse position determines lateral aim |
| Both | Pause | Tap/click pause button or `Esc` key |

### Physics

- **Throw power** is determined by swipe/drag speed (faster = harder throw)
- **Throw angle** is determined by swipe/drag direction (lateral deviation = left/right aim)
- Ball follows a parabolic arc with gravity
- Ball can bounce off the rim (rim physics with randomized bounce factor)
- "Swish" (nothing but net) is detected separately from rim shots
- Airballs miss entirely and roll back

---

## Scoring System

### Base Scoring

| Shot Type | Points |
|-----------|--------|
| Regular basket | 2 pts |
| Swish (no rim) | 3 pts |

### Streak System

Consecutive made shots build a streak counter displayed on the right side of the screen.

| Streak | Effect |
|--------|--------|
| 3 consecutive | "Heating Up" — ball glows orange |
| 5 consecutive | "On Fire!" — ball and hoop catch fire, all shots worth +1 bonus point |
| 7 consecutive | "Blazing!" — fire intensifies, all shots worth +2 bonus points |
| 10 consecutive | "Unstoppable!" — rainbow fire trail, all shots worth +3 bonus points |

A missed shot resets the streak to 0.

### Bonus Time

When the timer drops below 10 seconds, the game enters **Bonus Time**:
- Visual indicator appears: "Bonus Time! Pts x2"
- All scored points are doubled
- Timer text turns red
- Screen edges pulse with urgency glow

---

## Stage Progression

The game is structured in stages with escalating difficulty. Players must reach the target score before time expires to advance.

### Stage Definitions

| Stage | Target Score | Time Limit | Hoop Behavior | Ball Speed |
|-------|-------------|------------|----------------|------------|
| 1 | 20 pts | 30s | Stationary | Normal |
| 2 | 35 pts | 30s | Slight left-right sway | Normal |
| 3 | 50 pts | 28s | Moderate left-right movement | Faster return |
| 4 | 70 pts | 25s | Faster movement + slight depth bob | Faster return |
| 5 | 90 pts | 25s | Fast erratic movement | Fast return |
| 6+ | +25 pts/stage | 22s | Increasing speed | Fast return |

### Stage Transitions

- Completing a stage target: celebratory flash, "STAGE CLEAR!" text, 3-second transition
- Bonus seconds carry over: remaining time / 2 added to next stage
- Failing a stage: "TIME'S UP!" — game over, final score displayed

### Endless Mode

After Stage 10, the game enters **Endless Mode**:
- Target score increases by 30 per stage
- Time stays at 20 seconds
- Hoop movement becomes increasingly unpredictable
- Game continues until the player fails a stage

---

## Visual Design

### Art Direction

The game uses a **neon arcade aesthetic** with a dark arena atmosphere:

- **Color Palette:**
  - Primary: Cyan/electric blue (#00E5FF) — lane rails, UI accents
  - Secondary: Hot orange (#FF6B00) — lane trim, warm lighting
  - Score display: Neon green (#00FF41) — retro digital segment font
  - Background: Deep black (#0A0A0A) with subtle arena spotlights
  - Fire effects: Orange → Yellow → White gradient
  - UI text: White with subtle glow

- **Environment:**
  - First-person perspective looking down the shooting lane
  - Hardwood floor texture on the lane surface
  - Neon cyan LED strips along both side rails
  - Orange/warm accent lighting along rail edges
  - Wire mesh/cage walls on both sides (arcade machine style)
  - Dark arena background with distant spotlights and lens flares
  - Backboard with digital score display (green segment numbers)

### Basketball

- Realistic orange basketball with black seam lines
- Subtle rotation animation during flight
- Scale changes for depth perception (larger when close, smaller when far)
- Shadow beneath the ball that moves with it

### Hoop & Backboard

- Standard white net with physics-based sway animation
- Orange rim with metallic sheen
- Dark backboard with centered score counter (green digital numbers)
- Net reacts when ball passes through (ripple animation)

### Fire Effects

- Triggered by streak threshold (3+ consecutive makes)
- Flames emanate from the hoop rim
- Ball gets an orange glow/fire trail during flight
- Fire particles rise from the net after a score
- Intensity scales with streak level
- Uses Canvas particle system — no sprite assets needed

### HUD Layout

```
┌─────────────────────────────────────────────────┐
│  TARGET    TIME     STAGE                       │
│  20 PTS    0:07       1                         │
│                                                 │
│         ┌──────────┐                            │
│         │  SCORE   │                   STREAK   │
│         │   12     │                     7      │
│         └──────────┘                            │
│                                                 │
│              [HOOP]                             │
│                                                 │
│           ~~~~~~~~~~~~                          │
│          ~~ LANE FLOOR ~~                       │
│         ~~~~~~~~~~~~~~~~~~~~                    │
│                                                 │
│             (BALL)                              │
└─────────────────────────────────────────────────┘
```

- **TARGET** (top-left): Points needed to clear the stage
- **TIME** (top-center): Countdown timer, turns red below 10s
- **STAGE** (top-right): Current stage number
- **SCORE** (center, on backboard): Current score in green digital font
- **STREAK** (right side, vertical text): Current consecutive makes

### Notifications

Pop-up text effects for game events:
- "Swish!" — clean shot, no rim contact
- "Heating Up!" — 3-streak reached
- "On Fire!" — 5-streak reached
- "Bonus Time!" — timer below 10s
- "STAGE CLEAR!" — target score reached
- "TIME'S UP!" — stage failed

Each notification uses a scale-in + fade-out animation (0.8s duration).

---

## Audio Design

All sound effects generated procedurally via **Web Audio API** — no audio files needed.

### Sound Effects

| Event | Sound Description |
|-------|-------------------|
| Ball throw | Quick ascending whoosh (white noise burst) |
| Swish | High-pitched descending "swip" (sine wave) |
| Rim hit | Short metallic ping (square wave) |
| Score | Satisfying "ding" chord (major third interval) |
| Miss/airball | Low thud (filtered noise) |
| Streak milestone | Ascending arpeggio (3-note) |
| Fire activate | Crackling burst (filtered noise + sine) |
| Bonus Time start | Warning klaxon beeps |
| Stage clear | Victory fanfare (ascending scale) |
| Time's up | Descending buzzer (sawtooth wave) |
| UI button press | Click (short square pulse) |

### Background Ambience

- Subtle crowd murmur (low-frequency filtered noise loop)
- Volume swells on streaks and near-misses
- Crowd roar on stage clear

---

## Game States

```
┌──────────┐    ┌──────────┐    ┌──────────┐
│  TITLE   │───>│  PLAYING │───>│  STAGE   │
│  SCREEN  │    │          │    │  CLEAR   │──┐
└──────────┘    └────┬─────┘    └──────────┘  │
                     │                         │
                     v                         v
               ┌──────────┐    ┌──────────┐   │
               │  GAME    │    │  NEXT    │<──┘
               │  OVER    │    │  STAGE   │
               └────┬─────┘    └──────────┘
                    │
                    v
               ┌──────────┐
               │  HIGH    │
               │  SCORES  │
               └──────────┘
```

### Title Screen
- Game logo "HOOPS" with neon glow effect
- Basketball bouncing idle animation
- "TAP TO PLAY" / "CLICK TO PLAY" prompt
- High score display
- Settings icon (sound toggle)

### Playing
- Active gameplay with all HUD elements
- Ball throwing, scoring, streak tracking
- Timer countdown
- Pause overlay accessible

### Stage Clear
- Flash effect, "STAGE CLEAR!" text
- Score summary for the stage
- Brief celebration particles
- Auto-advance to next stage after 3 seconds

### Game Over
- "TIME'S UP!" with buzzer sound
- Final score display with stage reached
- "NEW HIGH SCORE!" if applicable
- "TAP TO RESTART" prompt
- Share score button

### High Scores
- Top 10 local high scores (localStorage)
- Each entry: rank, score, stage reached, date
- Optional: global leaderboard via Vercel KV

---

## Technical Architecture

### Stack

| Layer | Technology |
|-------|-----------|
| Rendering | HTML5 Canvas 2D |
| Language | Vanilla JavaScript (ES modules) |
| Audio | Web Audio API |
| Storage | localStorage (scores), optional Vercel KV |
| Hosting | Vercel (static + serverless) |
| Build | None — vanilla JS, no bundler needed |

### Project Structure

```
Hoops/
├── index.html              # Entry point
├── styles.css              # Global styles
├── vercel.json             # Vercel deployment config
├── package.json            # Project metadata & scripts
├── Docs/
│   └── GDD.md              # This document
├── src/
│   ├── main.js             # Entry point, game loop
│   ├── game.js             # Game state machine
│   ├── ball.js             # Ball physics & rendering
│   ├── hoop.js             # Hoop rendering & collision
│   ├── lane.js             # Lane/environment rendering
│   ├── hud.js              # HUD overlay (score, time, stage)
│   ├── input.js            # Touch/mouse input handling
│   ├── audio.js            # Web Audio API sound engine
│   ├── particles.js        # Particle system (fire, celebrations)
│   ├── scoring.js          # Score, streak, and stage logic
│   ├── screens.js          # Title, game over, stage clear screens
│   └── utils.js            # Math helpers, constants
└── api/
    └── scores.js           # Serverless function for leaderboard (optional)
```

### Canvas Rendering Pipeline

Each frame (targeting 60fps via `requestAnimationFrame`):

1. Clear canvas
2. Draw lane background (perspective-projected floor + rails)
3. Draw hoop, backboard, and net
4. Draw fire effects (if streak active)
5. Draw ball (with shadow and rotation)
6. Draw particles
7. Draw HUD overlay
8. Draw notification text

### Perspective Projection

The first-person lane view uses simple 2D perspective:
- Vanishing point at top-center of canvas
- Lane rails converge toward vanishing point
- Objects scale based on Y-position (further = smaller)
- Floor uses horizontal lines with decreasing spacing for depth

### Collision Detection

- Ball trajectory is computed as a parametric parabola
- Scoring zone: ball center passes through hoop circle (with tolerance)
- Rim collision: ball center within rim-width distance of rim edge
- Rim bounce: velocity reflection with dampening factor
- Swish detection: ball passes through scoring zone without rim proximity

### Input Handling

- Track pointer/touch start position and time
- On release: compute velocity vector from delta position / delta time
- Map vertical velocity to throw power (clamped to min/max)
- Map horizontal velocity to lateral aim offset
- Minimum swipe distance threshold to prevent accidental throws

---

## Performance Targets

| Metric | Target |
|--------|--------|
| Frame rate | 60 FPS |
| Input latency | < 16ms |
| First paint | < 1 second |
| Total bundle | < 100KB (no assets) |
| Mobile support | iOS Safari, Chrome Android |
| Desktop support | Chrome, Firefox, Safari, Edge |

---

## Monetization & Engagement (Future)

- **Daily Challenge:** Pre-set stage sequence, global leaderboard
- **Ball Skins:** Unlockable cosmetic basketballs (earned via milestones)
- **Achievements:** "First Swish", "10-Streak", "Stage 10 Reached", etc.
- **Share Score:** Social sharing with score card image generation
- **Multiplayer:** Side-by-side split screen or turn-based score attack

---

## MVP Scope (v1.0)

### Must Have
- [x] First-person lane view with perspective rendering
- [ ] Swipe/flick to throw basketball with physics
- [ ] Hoop with scoring detection and net animation
- [ ] Score counter (green digital numbers on backboard)
- [ ] Streak system with visual feedback
- [ ] Fire effects on hoop at 3+ streak
- [ ] Stage progression with target scores and timer
- [ ] Bonus Time mechanic (final 10 seconds)
- [ ] HUD: TARGET, TIME, STAGE, STREAK
- [ ] Title screen and game over screen
- [ ] Procedural audio via Web Audio API
- [ ] Mobile touch + desktop mouse support
- [ ] Local high score persistence (localStorage)
- [ ] Neon arcade visual theme

### Nice to Have
- [ ] Moving hoop (stages 2+)
- [ ] Particle celebration effects
- [ ] Global leaderboard (Vercel KV)
- [ ] Ball spin physics
- [ ] Crowd ambient audio
- [ ] Screen shake on powerful throws
- [ ] Achievement system

---

## References

- **Pop-A-Shot** — The original arcade basketball machine (1981), defines the core loop
- **NBA Jam** — "He's on fire!" streak system and announcer callouts
- **Flick Basketball / Basketball Kings** — Mobile swipe-to-shoot mechanics
- **NBA Hoop Troop** — Modern arcade cabinet with 100+ LEDs, neon aesthetic
- **Arcade Basket - Throw Master** — Moving hoops, bonus rounds, stage progression
