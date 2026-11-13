[Back to README](../README.md)

# Signing packages

A package's `SHA256SUMS` file proves that its files match a list. It does not prove who
wrote the list. A `SIGNATURE` file does that. This page shows how to create a signing key,
sign a `.llplugin` package, and add the public key to the launcher.

## How the launcher checks a package

Before installing a plugin, the launcher:

1. Checks every file against `SHA256SUMS`, and refuses files that are missing from the list.
2. Reads `SIGNATURE`, if present. It is a base64 ed25519 signature of the exact bytes of
   `SHA256SUMS` (standard base64, with padding; a trailing newline is allowed).
3. Verifies that signature against `plugins/trusted_keys` in the launcher's base folder.

| In the package             | Result                                                        |
| :------------------------- | :------------------------------------------------------------ |
| No `SIGNATURE`             | Unsigned. Installs only with `--allow-unsigned`.              |
| `SIGNATURE` matches a key  | Signed. Installs normally.                                    |
| `SIGNATURE` matches no key | Refused, even with `--allow-unsigned`.                        |
| `SHA256SUMS` is stale      | Refused. The signature cannot hide a checksum mismatch.       |

`trusted_keys` holds one standard-base64 ed25519 **raw public key** per line. Blank lines
are ignored, and `#` starts a comment:

```text
# release key, created 2026-11-13
d1a36ef420c267ae3677b155742e8fea8dc1861e3b7b48ebc262d10908a6a2d4
```

## 1. Create a key pair

```bash
bun src/cli/llp.ts keygen --out keys
```

`keygen` writes two files:

| File                 | Content                                                       | Mode   |
| :------------------- | :------------------------------------------------------------ | :----- |
| `keys/private.pem`   | ed25519 private key, PKCS8 PEM                                | `0600` |
| `keys/trusted_keys`  | one standard-base64 32-byte raw public key, followed by a newline | `0644` |

It refuses to overwrite an existing key pair, so a second run cannot destroy your signing
key. Keep `private.pem` secret: anyone who has it can sign a package your users trust.

> [!WARNING]
> Do not commit `private.pem`. Back it up somewhere safe. If you lose it, you cannot sign
> updates that existing users trust.

## 2. Add the public key to the launcher

Copy the contents of `keys/trusted_keys` into the launcher's trusted keys file, or append
it when you already have keys:

| Platform | File                                                        |
| :------- | :---------------------------------------------------------- |
| Linux    | `$XDG_CONFIG_HOME/light-launcher/plugins/trusted_keys`, or `~/.config/light-launcher/plugins/trusted_keys` |
| Windows  | `%APPDATA%\light-launcher\plugins\trusted_keys`             |

```bash
# Linux, first key
mkdir -p ~/.config/light-launcher/plugins
cp keys/trusted_keys ~/.config/light-launcher/plugins/trusted_keys

# Linux, another key
cat keys/trusted_keys >> ~/.config/light-launcher/plugins/trusted_keys
```

The launcher reads the file when it checks an install, so no restart is needed. One line is
one trusted public key. Removing a line stops packages signed by that key from installing.

## 3. Sign the package

Pack first, then sign:

```bash
bun src/cli/llp.ts pack --out dist
bun src/cli/llp.ts sign dist/demo-site-0.1.0.llplugin --key keys/private.pem
```

Without `--out`, `sign` replaces the package atomically. To keep the unsigned package and
write a new one:

```bash
bun src/cli/llp.ts sign dist/demo-site-0.1.0.llplugin \
  --key keys/private.pem \
  --out dist/demo-site-0.1.0-signed.llplugin
```

`sign` unpacks the package and checks the files it finds:

| Situation                                         | What `sign` does                                              |
| :------------------------------------------------ | :------------------------------------------------------------ |
| `SHA256SUMS` is complete and matches all files    | Signs those exact bytes; does not rewrite them.               |
| A file does not match `SHA256SUMS`                | Refuses. Run `llp pack` again and sign the new package.       |
| `SHA256SUMS` lists a missing file or misses one   | Refuses. Run `llp pack` again.                                |
| `SHA256SUMS` is missing                           | Generates one from the package files, then signs it.          |
| The package has an old `SIGNATURE`                | Replaces it after checking the checksums.                     |
| The zip holds unsafe paths, links or special files | Refuses. Repack with `llp pack`.                             |

The output keeps every file entry, its bytes and its permission bits, adds the verified or
generated `SHA256SUMS`, and adds `SIGNATURE` with a trailing newline.

> [!IMPORTANT]
> `sign` never repairs a stale `SHA256SUMS`. Signing a repaired list would hide changes made
> after the package was built. The only automatic rebuild is for a package that has no
> `SHA256SUMS` at all.

> [!NOTE]
> `llp validate` checks a plugin folder, not a `.llplugin` archive. Unpack the signed package
> and run `llp validate <folder>` to check its manifest again.

## 4. Publish and install

Publish the signed `.llplugin` file, for example as a GitHub release asset. Users install it
normally:

```bash
light-launcher plugin install demo-site-0.1.0.llplugin
```

If you also publish a release `SHA256SUMS` asset for the launcher's updater, hash the final
signed package file. The asset's line uses the same format as inside the package:

```text
<sha256 of the .llplugin>  demo-site-0.1.0.llplugin
```

> [!NOTE]
> The user must add your public key first. Installing a signed package from a publisher the
> launcher does not know fails with a trust error, not an unsigned warning.

## Rotating keys

Append the new public key to `trusted_keys`, sign new releases with the new private key, and
keep the old public key there until old releases are no longer used. There is no key expiry
and no key id in the package, so a `SIGNATURE` is accepted when any trusted key verifies it.

## Format limits

- One signature per package. Multi-signature packages are not supported.
- `SIGNATURE` covers only the `SHA256SUMS` bytes. There is no signed metadata, timestamp,
  key id or expiry.
- `keygen` writes an unencrypted PKCS8 private key. Protect it with file permissions and
  storage, not a passphrase.
- `sign` reads stored and deflated zip entries. Zip64 archives, encrypted entries and
  symbolic links are refused.
- Directory records in the input are kept when repacking. They carry no files and are not
  listed in `SHA256SUMS`; the launcher ignores them when it installs.
- Zip entries without Unix permission bits are repacked as `0644`. Packages built by
  `llp pack` keep their original modes.

## More

- [Writing a plugin](writing-a-plugin.md): build, check and pack a plugin.
- [Manifest](manifest.md): every field in `plugin.json`.
