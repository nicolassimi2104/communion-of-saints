# Communion of Saints

An All Saints' Day game. Everyone joins by scanning a QR code on their phone (no accounts), picks a saint type, gets dealt random strength, and the saints fight through a bracket of virtue trials + trivia. Host runs it from a laptop on the projector.

Plain HTML/CSS/JS, no build step. Supabase is the backend, Vercel hosts the files.

## Try it right now (no setup)

Open `index.html?mock=1` in a browser (or put the folder on any static host). Click **Host a new game**. Open more tabs on the same address with the join link shown; each tab acts as a different phone. Good for testing the whole flow alone.

## Go live: 15 minutes

1. **Supabase**: create a free project at supabase.com. Open **SQL Editor**, paste all of `supabase/schema.sql`, click Run.
2. **Keys**: Project Settings > API. Copy the Project URL and the `anon` (or "publishable") key into `config.js`. Both are safe to be public; the database is locked so the browser can only call the game functions.
3. **GitHub**: create a repo, push this folder.
4. **Vercel**: Add New Project > import the repo > Deploy. No settings to change.
5. Open your Vercel URL, click **Host a new game**, put the screen on the projector, everyone scans the QR.

Free Supabase projects pause after a week idle. Open the dashboard and click Restore a day or two before game night.

## How a game goes

1. Host opens the site, taps Host. Players scan the QR, enter name, saint, main type (required), side type (optional).
2. Host taps **Deal the cards**. Everyone sees their dealt stats. Redeal if you want.
3. Bracket plays out. Each match is best of 3 clashes (or Quick mode: one clash until the final). Every clash is a random arena + a trivia question.
4. Host taps Open, waits for both locks (or uses "Answer for them"), taps Reveal.

Lost your host screen? Lobby has a **Host recovery link**. Keep it private.

## How strength works

- Every saint gets **32 points** across 5 virtues (Faith, Courage, Wisdom, Charity, Perseverance), min 3, max 10 each.
- Main type guarantees +4 in its signature virtue, side type +2; the rest is random. Writing more never helps.
- Each arena tests one virtue and gives a home bonus (+3 main type, +2 side type) to two types.
- Clash score = virtue + d6 + home bonus + 3 for the right answer + intercession.
- Each type has a once-per-match power (Sound Doctrine, Unflinching Witness, etc).

Types are honor system; the host can fix anything with the Remove button.

## Tweaking

- `data.js`: questions (first option is always the correct one, it gets shuffled), arenas, types, abilities.
- `game.js`: `CS.RULES` at the top holds the numbers (total points, bonuses).
- `node tests/game.test.js` checks the rules still hold after you edit.
- `supabase/schema.sql` is safe to re-run.
