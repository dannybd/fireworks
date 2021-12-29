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
        // Keep the diff --git piece
        if (/^diff --git /.test(hunk)) {
          return true;
        }
        // If somehow, there's something which isn't a true git hunk,
        // drop it
        if (!/^@@ /.test(hunk)) {
          return false;
        }
        // Only keep "trivial" hunks for the base commit
        return isHunkTrivial(hunk);
      }),
    )
    // If we didn't find any trivial hunks, filter out
    .filter(perFilePatch => perFilePatch.find(hunk => /^@@ /.test(hunk)))
    // Join the hunks back together
    .map(perFilePatch => perFilePatch.join(''))
    // Join the files back together
    .join('');

  if (!firstPatch) {
    console.log('Found no trivial hunks, no changes made');
    return;
  }


  console.log(firstPatch);
}

function isHunkTrivial(hunk) {
  const lines = hunk.split('\n');
  const removed = lines.filter(line => /^- /.test(line));
  const added = lines.filter(line => /^\+ /.test(line));

  // If the changed line counts don't match then that's an easy sign
  // that non-trivial changes exist in this hunk, and it should be
  // kept prominent.
  if (added.length !== removed.length) {
    return false;
  }
  // Safeguard in case we somehow get an empty hunk
  if (added.length === 0) {
    return false;
  }
  return removed.every((before, i) => {
    before = before.substr(1);
    const after = added[i].substr(1);
    // Ensure for every line pair that the non-alpha characters all still match
    return before.replace(/\w/g, '') === after.replace(/\w/g, '')
      // and that the edit distance is under 3
      && levenshteinEditDistance(before, after) < 3
      && /ix/.test(after);
  });
}

run(baseDir);
