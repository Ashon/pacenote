# Pacenote team hub (docs/team-hub.md). The build context is this directory, and the code is a single prebuilt
# bundle with its licenses beside it (pnpm bundle, or pnpm hub:image to bundle and build in one step). Each release
# publishes it as ghcr.io/ashon/pacenote-hub (.github/workflows/hub-image.yml).
FROM node:24-bookworm-slim
# Links the published image to its repository on GitHub.
LABEL org.opencontainers.image.source="https://github.com/Ashon/pacenote" \
      org.opencontainers.image.licenses="Apache-2.0" \
      org.opencontainers.image.description="Pacenote team hub: one Slack app for a team, each member's mentions answered on their own Mac"
# Paired desktops (desktops.json). The volume inherits this ownership on first mount.
RUN mkdir -p /data && chown node:node /data
WORKDIR /app
COPY dist/hub.mjs ./hub.mjs
COPY dist/LICENSE dist/NOTICE dist/THIRD-PARTY-NOTICES.txt ./
USER node
ENV HUB_DATA_DIR=/data HUB_PORT=8790
EXPOSE 8790
CMD ["node", "hub.mjs"]
