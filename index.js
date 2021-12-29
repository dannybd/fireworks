import {promises as fs} from 'fs';
import {levenshteinEditDistance} from 'levenshtein-edit-distance';
import * as path from 'path';
import simpleGit from 'simple-git';
import {file as tmpFile} from 'tmp-promise';


const [repo] = process.argv.slice(2);
const baseDir = path.resolve(process.cwd(), repo || '.');

const git = simpleGit({baseDir});

async function run() {
  const currentBranch = await git.revparse([
    '--abbrev-ref',
    'HEAD',
  ]);

  const status = await git.status();
  if (!status.isClean()) {
    console.log('Status unclean, unsafe to continue');
    return;
  }

  const trivialPatch = await createTrivialPatch();
  if (!trivialPatch) {
    console.log('Found no trivial hunks, no changes made');
    return;
  }

  console.log('Patch created, saving to temp file');
  const tmp = await tmpFile();
  await fs.writeFile(tmp.path, trivialPatch);

  console.log('Moving to parent commit');
  await git.checkout('HEAD^');

  console.log('Applying patch');
  await git.applyPatch(tmp.path);

  console.log('Cleaning up patch');
  tmp.cleanup();

  console.log('Creating trivial commit');
  await git.commit('[ignore] auto-gen commit of webpack noise', ['-a']);

  console.log('Rebasing on top of trivial commit');
  await git.rebase([
    'HEAD',
    currentBranch,
  ]);

  console.log('Moving back to top');
  await git.checkout(currentBranch);

  console.log('Done!');
}

async function createTrivialPatch() {
  const fullPatch = await git.show();
  return fullPatch
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
        // If somehow, there's something which isn't a true git hunk, drop it
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
}

function isHunkTrivial(hunk) {
  const lines = hunk.split('\n');
  const removed = lines.filter(line => /^- /.test(line));
  const added = lines.filter(line => /^\+ /.test(line));

  /**
   * If the changed line counts don't match then that's an easy sign
   * that non-trivial changes exist in this hunk, and it should be
   * kept prominent.
   */
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
    const varRegex = /\b[A-Za-z]\w?\b/ig;
    const beforeWithoutVars = before.replace(varRegex, '');
    const afterWithoutVars = after.replace(varRegex, '');
    if (beforeWithoutVars !== afterWithoutVars) {
      // Some non-trivial non-variable change!
      return false;
    }
    const beforeVars = before.match(varRegex).join(' ');
    const afterVars = after.match(varRegex).join(' ');
    return levenshteinEditDistance(beforeVars, afterVars) < 4;
  });
}

run();
