# Fireworks 🎆, a package for hiding uninteresting JS changes from webpack

[SIBR](https://sibr.dev) regularly analyzes changes to [Blaseball](https://blaseball.com)'s frontend code. Its JS comes minified through webpack, which, among other things, loves to scramble the variable names it uses every time it regenerates.

SIBR's built tools to prettify and clean up a lot of these minified changes, but the variable names remain a nuisance, [regularly bloating changes to `blaseball-site-files`](https://github.com/xSke/blaseball-site-files/commit/827c12918a36130d73c67484cd05ca5fd5cd667b) with stuff that just makes the actual changes harder to read and find.

To combat this, this node package reads the latest commit, parses the patch of changes, and splits its hunks into two commits:

- a base commit, containing only diff changes which rename variables,
- a second commit, containing everything else.

This way, the overall diff across the two commits is the same, but the second commit can be reviewed as standalone, and should be higher signal-to-noise.
