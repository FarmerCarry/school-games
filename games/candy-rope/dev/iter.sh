#!/bin/sh
# dev helper: solve some levels (1-based), write solutions, render preview of a range
# usage: sh dev/iter.sh "4 9 10" 0 12  [tries]
cd /home/user/school-games
node games/candy-rope/dev/solve.js --tries ${4:-3000} --write $1 | grep -v '^wrote'
node tools/playtest.mjs candy-rope --path "/games/candy-rope/dev/preview.html?from=$2&n=$3" --size 1280x$(( ($3+1)/2*360 )) --out /tmp/playtest/candy-rope/prev --actions-json "[{\"wait\":300},{\"shot\":\"it\"}]" > /dev/null
