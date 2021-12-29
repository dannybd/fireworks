import {levenshteinEditDistance} from 'levenshtein-edit-distance';
import * as path from 'path';
import simpleGit from 'simple-git';


const [repo] = process.argv.slice(2);
const baseDir = path.resolve(process.cwd(), repo || '.');

async function run(baseDir) {
  const git = simpleGit({baseDir});
  // console.log(`Running in ${baseDir}`);

  const status = await git.status();
  if (!status.isClean()) {
    console.log('Status unclean, unsafe to continue');
    return;
  }

  const fullPatch = await git.show();
  const firstPatch = fullPatch
    // Find each per-file patch
    .split(/^(?=diff --git )/m)
    // Only keep the ones which are JS files
    .filter(perFilePatch => /^diff --git a\/\S*\.js/.test(perFilePatch))
    // Then, for each JS file:
    .map(perFilePatch => perFilePatch
      // Split out each hunk
      .split(/^(?=@@ )/m)
      // Keep only useless hunks which could be in the base commit
      .filter(hunk => {
        if (/^diff --git /.test(hunk)) {
          return true;
        }
        if (!/^@@ /.test(hunk)) {
          return false;
        }
        return isHunkIgnorable(hunk);
      }),
    )
    // If we didn't find any ignorable hunks, filter out
    .filter(perFilePatch => perFilePatch.find(hunk => /^@@ /.test(hunk)))
    // Join the hunks back together
    .map(perFilePatch => perFilePatch.join(''))
    // Join the files back together
    .join('');

  if (!firstPatch) {
    console.log('Found no ignorable hunks, no changes made');
    return;
  }
  console.log(firstPatch);
}

function isHunkIgnorable(hunk) {
  const lines = hunk.split('\n');
  const removed = lines.filter(line => /^- /.test(line));
  const added = lines.filter(line => /^\+ /.test(line));
  if (added.length !== removed.length) {
    return false;
  }
  if (added.length === 0) {
    return false;
  }
  return removed.every((before, i) => {
    before = before.substr(1);
    const after = added[i].substr(1);
    return before.replace(/\w/g, '') === after.replace(/\w/g, '')
      && levenshteinEditDistance(before, after) < 3;
  });
}

run(baseDir);
