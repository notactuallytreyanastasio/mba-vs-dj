# MBA or DJ? A live decision tree

A classroom tool for teaching decision trees. The tree is a [deciduous](https://github.com/notactuallytreyanastasio/deciduous)
decision graph; the site in `docs/` draws it, rolls it back, and shows every step of the math as the class changes it.

**Live:** https://notactuallytreyanastasio.github.io/mba-vs-dj/

## The tree

Each path is a few steps of life, not one jump to the end:

```
MBA (applications $10k)
├─ Admitted 75% (tuition and two years without salary, $240k)
│  ├─ Corporate management 45%                    $1,700k
│  ├─ Leaves for something else 15%               $900k
│  └─ Top-firm summer internship 40%
│     ├─ Consulting or banking 80%                $2,600k
│     └─ No return offer, recruits again 20%      $1,600k
└─ Not admitted: keeps current job 25%            $900k
DJ (gear $15k)
├─ Small rooms, ~15 people 60%                    $250k
└─ Gets regular local bookings 40%   ← a later choice
   ├─ Quit the day job, go full-time
   │  ├─ Big rooms, ~1,000 people (lucky) 8%      $1,200k
   │  ├─ Club rooms, ~100 people 52%              $400k
   │  └─ Back to small rooms 40%                  $200k
   └─ Keep the day job, DJ weekends               $550k
```

EV(MBA) = $1,430k, EV(DJ) = $355k. The later choice is the one to teach with: on money, a booked DJ keeps the day
job ($550k against $384k for going full-time), but going full-time has the happier rooms (6.96 against 5), so it
wins once a point of satisfaction is worth about $85k. The root decision needs about $725k a point to flip.

## Running a class

1. **Gut check.** Poll tab, "Gut check". Count hands for MBA vs DJ before showing any numbers.
2. **Read the tree.** Squares are choices, circles are chance, triangles are where you end up. The math panel works
   backwards from the end points: each circle is a probability-weighted average, each square takes the best branch.
3. **Ask for the odds.** Poll tab, pick a chance node ("Odds: DJ"), type in how many students picked each bucket,
   then "Use these as the probabilities". The tree and the math update.
4. **Argue about a number.** Click any name or number on the tree and type over it (Enter keeps it, Esc puts it
   back, Tab moves to the same field on the next node; `35`, `35%` and `0.35` are all 35%, `1.2m` is $1,200k).
   Clicking a node puts a toolbar for it in the corner of the tree: add what happens next, add a choice, rename,
   delete. The Edit tab has the rest: satisfaction, notes, revisions. The "What would it take?"
   chart shows the probability at which the decision flips, or that none does. In the shipped tree, no
   probability of playing big rooms makes DJ win on money: a DJ who plays 1,000-person rooms for ten years
   still ends up behind the MBA average.
5. **Put a price on happiness.** Raise "$k per point" to weight satisfaction (0 to 10 on each end point) against money.
6. **Compare.** History tab: save snapshots ("before poll", "after poll") and see the decision under each.

7. **Ask DeepSeek.** Type a change into the bar under the tree ("add a producer outcome for DJs, 5%, $600k",
   "what if MBA tuition doubles?") and press Edit tree. "Explain to the class" narrates the current tree.

8. **Grow it.** The Ideas tab is a board for branches the class might add. Press Brainstorm on an end point
   ("what happens next?"), a chance node ("what's missing?") or the decision ("what other paths?") and DeepSeek
   puts 4–6 ideas on it, each with a reason. Ideas from the room go on it too. Hover a card and it shows in the tree
   as a dashed ghost branch, with what it would do: "If added: EV(DJ) $304k → $331k · still MBA". Then Add, Park or
   Discard it. The History tab replays every change, so you can press Play and watch the tree grow.

Growing an end point keeps its money as what was earned up to there; what you add below comes on top (shown as
"+$260k"). A single new outcome doesn't become certain: the rest of the probability goes to "Carries on as before".
A new later choice always comes with "Keep going as before", so a choice can only add value when it beats
staying put. That's the value of having options, visible in the math. Satisfaction counts only at end points.

Parked and discarded ideas are exported to deciduous as observations with `idea_status=` and come back on the
board for the next class. What the class did with an idea from deciduous (added, discarded) is written back as
the node's status.

The tree is drawn with D3: scroll to zoom, drag the background to pan, hover anything for its share of the math,
drag a `p = …` pill sideways (or scroll on it) to change a probability while its siblings rebalance, and
double-click a node to fold it.

Edits stay in the browser (localStorage) until you send them back to deciduous.

## How the tree maps onto deciduous

| deciduous node | in the tree |
|---|---|
| `goal` | the decision |
| `option` | a path to choose; `cost=` in the description |
| `outcome` | what chance hands you; **confidence is the probability**; `payoff=` and `joy=` in the description |
| `observation` under a tree node | a revision of that node: `p=`, `payoff=`, `joy=`, `cost=`, `title=` (newest wins) |
| `observation` with `idea_status=` | an idea on the board (`parked` or `discarded`), not part of the tree yet |

Money is in $k, 10-year net earnings. The numbers are classroom assumptions to argue with, not data.

## Saving a class's changes

Deciduous tab, then "Write deciduous commands". That gives you a shell script that records each change as an
observation linked to the node it revises (plus the verdict on the root), then runs `./publish.sh`. Commit
`.deciduous/graph.json` and `docs/graph-data.json`, push, and the live site opens on the class's numbers, with the
history of how they got there on each node.

To change the base tree directly, use `deciduous add` / `deciduous link`, then `./publish.sh`.

## Local

```sh
./publish.sh                       # deciduous graph > docs/graph-data.json
cd docs && python3 -m http.server  # http://localhost:8000
```

## DeepSeek

The site calls `https://bobbby.online/dtree-ai/{edit,explain}`, a small Node service in `proxy/` that holds the
DeepSeek key, so the public page never does. The browser sends the tree (plus the instruction, or the computed
facts), and the proxy fixes everything else: prompts, model, tool schema, token budgets. Limits: 60 calls per IP per
hour and 1,500 per day, in memory.

- **Edit tree**: `deepseek-chat` (V4.1 Flash, thinking off) with a forced `edit_tree` tool call, about 1.5 s. The
  site checks every op before applying it: unknown ids, probabilities outside 0–1 and outcomes beside choices are
  listed as "not applied" instead of guessed at. One AI edit is one undo.
- **Brainstorm**: `deepseek-chat` with a forced `suggest_branches` tool call, about 5 s. What it suggests depends
  on the focus node; the site checks each idea against the tree (no outcomes beside choices, no duplicates) before
  it can be added.
- **Explain to the class**: the site computes the facts (each EV, the margin, break-evens for probabilities, payoffs,
  cost and the price of satisfaction) and the model only narrates them, about 3 s. Letting the model think it
  through with `deepseek-flash` got the same numbers but took 20 s, too slow to use live in class.

It runs as the `dtree-ai` service in the blog stack on the Hetzner box (`/opt/dtree-ai`, Caddy `handle_path
/dtree-ai/*`). To redeploy after changing `proxy/`:

```sh
rsync -a --delete proxy/ root@5.161.181.91:/opt/dtree-ai/
ssh root@5.161.181.91 'cd /opt/blog && docker compose up -d --build dtree-ai'
```

For local work run `DEEPSEEK_API_KEY=… PORT=8790 node proxy/server.mjs` and open the site with
`?ai=http://localhost:8790`.
