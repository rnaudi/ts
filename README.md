# ts

i haven't used ts in ages, structured concurrency patterns

following the latest matklad blog about dax, i added a cli example with ADTs and
exhaustive pattern matching, neat

```
deno compile \
  --allow-run \
  --allow-env \
  --allow-read \
  --output aws \
  aws.ts


./aws --profile=sa --mode=server
```
