Everway screenshot and generation tests (needs Node.js with Playwright, and Python with Pillow).

  node tests/phase0.js dist new scenes      -> shots/p0/new_<region>_<noon|golden|night>.jpg
  node tests/phase0.js dist new drive       -> drives 60 s at full speed, reports generation time per frame
  python tests/compare.py old new           -> difference between two sets of screenshots

Run once before a change (prefix "old") and once after (prefix "new"), then compare.
