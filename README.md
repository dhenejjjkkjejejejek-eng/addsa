# Epic Games V-Bucks Gift Hub — Concept Demo

A Node.js app demoing a "Gift V-Bucks to a player" feature for the Epic Games Store, replicating Epic's actual visual style (PDP layout, buy box, PayPal-style demo checkout, transaction receipt).

## Run it

```bash
npm install
node server.js
```

Open http://localhost:3000

## Flow

1. Browse the 4 official V-Bucks packs (real Epic CDN artwork)
2. Click a pack → opens the product detail page styled like Epic's store
3. Type any username into "Gift to a Player" — it's instantly found (demo, accepts anything)
4. Click Buy Now → PayPal-style checkout (clearly marked DEMO MODE on the payment box only — no real charge)
5. 3-stage processing animation
6. PayPal-style transaction receipt with a random transaction ID
7. Closing shows a toast notification + confetti celebration

## Note

This is a **concept demo** built to pitch to Epic Games. No real payments occur — the "DEMO MODE" pill on the PayPal panel is the only on-screen indicator, kept deliberately subtle so the rest of the experience matches Epic's real site 1:1, as requested.
