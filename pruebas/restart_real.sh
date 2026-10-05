#!/bin/bash
cd /tmp/claude-0/qa
for p in $(ps -eo pid,args | awk '$2=="node" && $3=="server_real.js"{print $1}'); do kill $p; done
sleep 1
setsid nohup node server_real.js 8790 > real.log 2>&1 < /dev/null &
sleep 5
cat real.log
