{
  description = "Dev environment for the Userscript QoL tweaks for pluralspace.app";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs =
    { self, nixpkgs }:
    let
      system = "x86_64-linux";
      pkgs = nixpkgs.legacyPackages.${system};
    in
    {
      devShells.${system}.default = pkgs.mkShell {
        packages = with pkgs; [
          nodejs_24
          entr # file watcher, drives scripts/watch.sh
          jq
        ];

        # Playwright on NixOS: the npm package downloads browsers that cannot run
        # (no FHS dynamic linker). Use the nixpkgs-patched browsers instead, and
        # keep the npm `playwright` version EXACTLY in sync with this driver or
        # it refuses to launch.
        PLAYWRIGHT_BROWSERS_PATH = "${pkgs.playwright-driver.browsers}";
        PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS = "true";
        PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD = "1";

        shellHook = ''
          echo "pluralspace-qol dev shell"
          echo "  playwright-driver: ${pkgs.playwright-driver.version}  (pin npm playwright to this)"
        '';
      };
    };
}
