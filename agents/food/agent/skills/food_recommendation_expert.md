---
description: "Knowledge of local dining and event venues in LES."
---

---
description: "Knowledge of local dining and event venues in LES."
---
**Trigger:** "where should I eat", "find me X", "I'm hungry", "takeout
tonight", or any open-ended craving.
Steps:
1. Read memory: known loves, dislikes, allergies/diet, places already tried,
   and anything saved as "want to try".
2. Infer constraints from context: solo vs. group, dine-in vs. takeout/delivery,
   budget, cuisine, time available. Ask **at most one** clarifying question and
   only if a wrong guess would waste their evening.
3. Call `search_places` with a rich `textQuery` (cuisine + vibe + "Lower East
   Side / Chinatown / East Village, Manhattan") and `locationBias` set to home
   coords. Example query: `"cozy date-night izakaya Lower East Side Manhattan"`.
4. Filter against memory — drop disliked spots and anything they've told you to
   stop suggesting. Prefer new spots from the "want to try" list when relevant.
5. For the top pick, call `compute_routes` (WALK) from home to get real walk
   time/distance. For takeout, note it's pickup distance.
6. Return: **one headline pick** with a one-line "why you'll like it" tied to
   their actual taste, walk time, and Maps links — plus 2 backups in a tight
   list.
7. Save the recommendation to memory as "suggested on <date>" so you can ask for
   a verdict later.

**Trigger:** "plan dinner", "set me up for tonight", "I want takeout at 8".
Steps:
1. Run Skill 1 to land the spot.
2. Call `lookup_weather` for home coords at the target hour. Use it to advise:
   bring an umbrella, grab delivery instead of walking, patio vs. indoors.
3. Build a tight plan: leave-by time (from walk duration + a buffer), or
   order-by time for pickup, what to order (lean on memory + the place's known
   specialties from the search summary), and a weather note.
4. Provide the `directionsUrl` and `placeUrl`. For takeout, remind them of
   pickup walk time both ways.
5. Save the plan and set an expectation to follow up for a verdict.

**Trigger:** user pastes a Google Maps link or names a specific spot
("add Kiki's", "thoughts on this: maps.app.goo.gl/…").
Steps:
1. If it's a URL, call `resolve_maps_urls`. If it's a name/address, call
   `resolve_names` (with `locationBias` viewport around the LES or
   `regionCode: "US"`). Check `failedRequests` and report any that didn't
   resolve instead of guessing.
2. Use the resolved place to enrich: a quick `search_places` for details
   (hours, vibe) if they want context.
3. Save to memory under "want to try" (or update an existing entry) with the
   place id and why it's on the radar.

**Trigger:** "I went to X", "that ramen was great/mid", or your own follow-up
after a planned meal.
Steps:
1. Match to the place in memory (resolve via `resolve_names` if it's new).
2. Log a structured verdict: rating, what they ordered, what they'd repeat,
   what to avoid, date. Update aggregate signals (loved cuisines, dealbreakers).
3. Confirm briefly and note how it changes future picks.
