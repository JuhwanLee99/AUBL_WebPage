# NAS backend runtime image

Build the tested executable JAR in `AUBL_WebPage_BE-test` with Java 21 first.
The Docker context must contain only a copy of that verified JAR named `app.jar`;
never build this runtime image with the backend source directory as its context.
`Dockerfile.dockerignore` additionally excludes everything except `app.jar`.

From the web repository root:

```sh
mkdir -p .tmp
release_context=$(mktemp -d "$PWD/.tmp/backend-runtime.XXXXXX")
cp /absolute/path/to/tested/webpage-0.0.1-SNAPSHOT.jar "$release_context/app.jar"
shasum -a 256 "$release_context/app.jar"
docker buildx build --platform linux/amd64 --load \
  -f services/backend-runtime/Dockerfile \
  -t 'synapse9983/aubl-backend:REPLACE_WITH_UNUSED_VERSION' "$release_context"
```

Replace the sample JAR path and tag before running the commands. After checking
the image architecture, JAR checksum, tests and migration baseline,
push the unused version to the existing repository. In Portainer, preserve the
existing environment, network, port and Firebase credentials mount. Update the
backend before the worker. Keep old images available for rollback.

The base digest is the exact Java 21 runtime resolved for the v24 release. Update
it deliberately with runtime verification; do not silently follow a moving tag.
Runtime credentials and database dumps must never be copied into the image.
