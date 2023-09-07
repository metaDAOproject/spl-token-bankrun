# SPL Token Bankrun

[Bankrun](https://github.com/kevinheavey/solana-bankrun/tree/main) is a framework
for writing [very fast](https://twitter.com/metaproph3t/status/1691566481396338824?s=20)
[Solana](https://github.com/solana-labs/solana) and [Anchor](https://github.com/coral-xyz/anchor)
tests. However, it doesn't work natively with SPL token. This package bridges
the gap, allowing you to easily manipulate SPL tokens from your Bankrun tests.

## Example

```typescript
import * as anchor from "@project-serum/anchor";
import * as token from "@solana/spl-token";
import { BankrunProvider } from "anchor-bankrun";

import { AutocratV0 } from "../target/types/autocrat_v0";
import * as AutocratIDL from "../target/idl/autocrat_v0.json";
export type AutocratProgram = Program<AutocratV0>;

import {
  createMint,
  createAccount,
  createAssociatedTokenAccount,
  mintTo,
  getAccount,
} from "spl-token-bankrun";


const AUTOCRAT_PROGRAM_ID = new PublicKey(
  "5QBbGKFSoL1hS4s5dsCBdNRVnJcMuHXFwhooKk2ar25S"
);

describe("autocrat_v0", async function () {
  let autocrat,
    payer,
    context,
    banksClient;

  before(async function () {
    context = await startAnchor("./", [], []);
    banksClient = context.banksClient;
    anchor.setProvider(new BankrunProvider(context));

    autocrat = new anchor.Program<AutocratProgram>(
      AutocratIDL,
      AUTOCRAT_PROGRAM_ID,
      provider
    );

    payer = autocrat.provider.wallet.payer;
  });

  describe("#initialize_dao", async function () {
    it("token stuff", async function () {
      const authority = anchor.web3.Keypair.generate();

      const mint = await createMint(banksClient, payer, authority.publicKey, authority.piblicKey, 9);

      const acc = await createAccount(
	banksClient,
	payer,
	mint,
	authority.publicKey
      );

      const storedAcc = await getAccount(
	banksClient,
	acc
      );
      
      console.log(storedAcc);
    });
  });
});
```
