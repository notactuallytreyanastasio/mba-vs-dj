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
