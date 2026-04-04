#!/bin/bash
curl -s -X POST http://localhost:3000/shutdown \
  > /dev/null 2>&1
exit 0
