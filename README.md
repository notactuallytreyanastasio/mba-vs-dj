# MBA or DJ? A live decision tree

A classroom tool for teaching decision trees. The tree is a [deciduous](https://github.com/notactuallytreyanastasio/deciduous)
decision graph; the site in `docs/` draws it, rolls it back, and shows every step of the math as the class changes it.

**Live:** https://notactuallytreyanastasio.github.io/mba-vs-dj/

## Running a class

1. **Gut check.** Poll tab, "Gut check". Count hands for MBA vs DJ before showing any numbers.
2. **Read the tree.** Squares are choices, circles are chance, triangles are where you end up. The math panel works
   backwards from the end points: each circle is a probability-weighted average, each square takes the best branch.
3. **Ask for the odds.** Poll tab, pick a chance node ("Odds: DJ"), type in how many students picked each bucket,
   then "Use these as the probabilities". The tree and the math update.
4. **Argue about a number.** Click any node to change its probability, earnings or cost. The "What would it take?"
   chart shows the probability at which the decision flips, or that none does. In the shipped tree, no
   probability of playing big rooms makes DJ win on money: a DJ who plays 1,000-person rooms for ten years
   still ends up behind the MBA average.
5. **Put a price on happiness.** Raise "$k per point" to weight satisfaction (0 to 10 on each end point) against money.
6. **Compare.** History tab: save snapshots ("before poll", "after poll") and see the decision under each.

7. **Ask DeepSeek.** Type a change into the bar under the tree ("add a producer outcome for DJs, 5%, $600k",
   "what if MBA tuition doubles?") and press Edit tree. "Explain to the class" narrates the current tree.

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
