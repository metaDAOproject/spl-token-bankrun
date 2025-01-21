import { SystemProgram, Signer, PublicKey, Keypair, Transaction, Commitment, ConfirmOptions, AccountInfo, SendTransactionError } from "@solana/web3.js";

import * as token from "@solana/spl-token";
import { FailedTransactionMetadata, LiteSVM, TransactionMetadata } from "litesvm";

function handleFailedTx(res: FailedTransactionMetadata | TransactionMetadata, signature: Buffer) {
  if (res instanceof FailedTransactionMetadata) {
    throw new SendTransactionError({
      action: "send",
      signature: signature.toString(),
      transactionMessage: res.err().toString(),
      logs: res.meta().logs()
    });
  }
}

export function createMint(
  client: LiteSVM,
  payer: Keypair,
  mintAuthority: PublicKey,
  freezeAuthority: PublicKey | null,
  decimals: number,
  keypair = Keypair.generate(),
  programId = token.TOKEN_PROGRAM_ID
): PublicKey {
  let rent = client.getRent();

  const tx = new Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: payer.publicKey,
      newAccountPubkey: keypair.publicKey,
      space: token.MINT_SIZE,
      lamports: Number(rent.minimumBalance(BigInt(token.MINT_SIZE))),
      programId: token.TOKEN_PROGRAM_ID,
    }),
    token.createInitializeMint2Instruction(
      keypair.publicKey,
      decimals,
      mintAuthority,
      freezeAuthority,
      programId
    )
  );
  [tx.recentBlockhash] = (client.latestBlockhash())!;
  tx.sign(payer, keypair);

  const res = client.sendTransaction(tx);
  handleFailedTx(res, tx.signature!);
  return keypair.publicKey;
}

export function createAccount(
  client: LiteSVM,
  payer: Signer,
  mint: PublicKey,
  owner: PublicKey,
  keypair?: Keypair,
  confirmOptions?: ConfirmOptions,
  programId = token.TOKEN_PROGRAM_ID
): PublicKey {
  let rent = client.getRent();
  // If a keypair isn't provided, create the associated token account and return its address
  if (!keypair)
    return createAssociatedTokenAccount(
      client,
      payer,
      mint,
      owner,
      programId
    );

  // Otherwise, create the account with the provided keypair and return its public key
  const mintState = getMint(
    client,
    mint,
    confirmOptions?.commitment,
    programId
  );
  const space = token.getAccountLenForMint(mintState);

  const tx = new Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: payer.publicKey,
      newAccountPubkey: keypair.publicKey,
      space,
      lamports: Number(rent.minimumBalance(BigInt(space))),
      programId,
    }),
    token.createInitializeAccountInstruction(
      keypair.publicKey,
      mint,
      owner,
      programId
    )
  );
  [tx.recentBlockhash] = (client.latestBlockhash())!;
  tx.sign(payer, keypair);
  const res = client.sendTransaction(tx);
  handleFailedTx(res, tx.signature!);
  return keypair.publicKey;
}

export function createAssociatedTokenAccount(
  client: LiteSVM,
  payer: Signer,
  mint: PublicKey,
  owner: PublicKey,
  programId = token.TOKEN_PROGRAM_ID,
  associatedTokenProgramId = token.ASSOCIATED_TOKEN_PROGRAM_ID
): PublicKey {
  const associatedToken = token.getAssociatedTokenAddressSync(
    mint,
    owner,
    true,
    programId,
    associatedTokenProgramId
  );

  const tx = new Transaction().add(
    token.createAssociatedTokenAccountInstruction(
      payer.publicKey,
      associatedToken,
      owner,
      mint,
      programId,
      associatedTokenProgramId
    )
  );

  [tx.recentBlockhash] = (client.latestBlockhash())!;
  tx.sign(payer);

  const res = client.sendTransaction(tx);
  handleFailedTx(res, tx.signature!);
  return associatedToken;
}

export function getMint(
  client: LiteSVM,
  address: PublicKey,
  commitment?: Commitment,
  programId = token.TOKEN_PROGRAM_ID
): token.Mint {
  const info = client.getAccount(address);
  return token.unpackMint(address, info as AccountInfo<Buffer>, programId);
}

// `mintTo` without the mintAuthority signer
// uses bankrun's special `setAccount` function
export function mintToOverride(
  client: LiteSVM,
  destination: PublicKey,
  amount: bigint,
) {
  const existingAccount = getAccount(client, destination);
  const { mint, owner } = existingAccount;

  const accData = Buffer.alloc(token.ACCOUNT_SIZE);
  token.AccountLayout.encode(
    {
      mint,
      owner,
      amount,
      delegateOption: 0,
      delegate: PublicKey.default,
      delegatedAmount: 0n,
      state: 1,
      isNativeOption: 0,
      isNative: 0n,
      closeAuthorityOption: 0,
      closeAuthority: PublicKey.default,
    },
    accData
  );

  client.setAccount(destination, {
    data: accData,
    executable: false,
    lamports: 1_000_000_000,
    owner: token.TOKEN_PROGRAM_ID,
  });
}

export function mintTo(
  client: LiteSVM,
  payer: Signer,
  mint: PublicKey,
  destination: PublicKey,
  authority: Signer | PublicKey,
  amount: number | bigint,
  multiSigners: Signer[] = [],
  programId = token.TOKEN_PROGRAM_ID
): TransactionMetadata | FailedTransactionMetadata {
  const [authorityPublicKey, signers] = getSigners(authority, multiSigners);

  const tx = new Transaction().add(
    token.createMintToInstruction(
      mint,
      destination,
      authorityPublicKey,
      amount,
      multiSigners,
      programId
    )
  );
  [tx.recentBlockhash] = (client.latestBlockhash())!;
  tx.sign(payer, ...signers);

  return client.sendTransaction(tx);
}

export function transfer(
  client: LiteSVM,
  payer: Signer,
  source: PublicKey,
  destination: PublicKey,
  owner: PublicKey | Signer,
  amount: number | bigint,
  multiSigners: Signer[] = [],
  programId = token.TOKEN_PROGRAM_ID
): TransactionMetadata | FailedTransactionMetadata {
  const [ownerPublicKey, signers] = getSigners(owner, multiSigners);

  const tx = new Transaction().add(
    token.createTransferInstruction(
      source,
      destination,
      ownerPublicKey,
      amount,
      multiSigners,
      programId
    )
  );
  [tx.recentBlockhash] = (client.latestBlockhash())!;
  tx.sign(payer, ...signers);

  return client.sendTransaction(tx);
}

export function getSigners(
  signerOrMultisig: Signer | PublicKey,
  multiSigners: Signer[]
): [PublicKey, Signer[]] {
  return signerOrMultisig instanceof PublicKey
    ? [signerOrMultisig, multiSigners]
    : [signerOrMultisig.publicKey, [signerOrMultisig]];
}

export function getAccount(
  client: LiteSVM,
  address: PublicKey,
  programId = token.TOKEN_PROGRAM_ID
): token.Account {
  const info = client.getAccount(address);
  return token.unpackAccount(address, info as AccountInfo<Buffer>, programId);
}
