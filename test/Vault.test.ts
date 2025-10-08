import { expect } from "chai";
import { ethers } from "hardhat";
import { Vault, MockERC20 } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

describe("Vault", function () {
  let vault: Vault;
  let usdc: MockERC20;
  let usdt: MockERC20;
  let owner: HardhatEthersSigner;
  let user1: HardhatEthersSigner;
  let user2: HardhatEthersSigner;

  const INITIAL_SUPPLY = ethers.parseUnits("1000000", 6); // 1M tokens with 6 decimals
  const DEPOSIT_AMOUNT = ethers.parseUnits("1000", 6); // 1000 tokens

  beforeEach(async function () {
    // Get signers
    [owner, user1, user2] = await ethers.getSigners();

    // Deploy Vault
    const VaultFactory = await ethers.getContractFactory("Vault");
    vault = await VaultFactory.deploy();

    // Deploy mock USDC (6 decimals)
    const MockERC20Factory = await ethers.getContractFactory("MockERC20");
    usdc = await MockERC20Factory.deploy("USD Coin", "USDC", 6);

    // Deploy mock USDT (6 decimals)
    usdt = await MockERC20Factory.deploy("Tether USD", "USDT", 6);

    // Mint tokens to users
    await usdc.mint(user1.address, INITIAL_SUPPLY);
    await usdc.mint(user2.address, INITIAL_SUPPLY);
    await usdt.mint(user1.address, INITIAL_SUPPLY);

    // Add USDC as supported token
    await vault.addSupportedToken(await usdc.getAddress());
  });

  describe("Deployment", function () {
    it("Should set the correct owner", async function () {
      expect(await vault.owner()).to.equal(owner.address);
    });

    it("Should have zero total deposits initially", async function () {
      expect(await vault.totalDeposits(await usdc.getAddress())).to.equal(0);
    });
  });

  describe("Supported Tokens", function () {
    it("Should add a supported token", async function () {
      await vault.addSupportedToken(await usdt.getAddress());
      expect(await vault.isTokenSupported(await usdt.getAddress())).to.be.true;
    });

    it("Should emit TokenAdded event", async function () {
      const usdtAddress = await usdt.getAddress();
      await expect(vault.addSupportedToken(usdtAddress))
        .to.emit(vault, "TokenAdded")
        .withArgs(usdtAddress);
    });

    it("Should remove a supported token", async function () {
      const usdcAddress = await usdc.getAddress();
      await vault.removeSupportedToken(usdcAddress);
      expect(await vault.isTokenSupported(usdcAddress)).to.be.false;
    });

    it("Should revert when non-owner tries to add token", async function () {
      await expect(
        vault.connect(user1).addSupportedToken(await usdt.getAddress())
      ).to.be.revertedWithCustomError(vault, "OwnableUnauthorizedAccount");
    });

    it("Should revert when adding zero address", async function () {
      await expect(
        vault.addSupportedToken(ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(vault, "ZeroAddress");
    });
  });

  describe("Deposits", function () {
    it("Should accept USDC deposits", async function () {
      const usdcAddress = await usdc.getAddress();

      // Approve vault to spend tokens
      await usdc.connect(user1).approve(await vault.getAddress(), DEPOSIT_AMOUNT);

      // Deposit
      await vault.connect(user1).deposit(usdcAddress, DEPOSIT_AMOUNT);

      // Check balances
      expect(await vault.balanceOf(user1.address, usdcAddress)).to.equal(DEPOSIT_AMOUNT);
      expect(await vault.totalDeposits(usdcAddress)).to.equal(DEPOSIT_AMOUNT);
    });

    it("Should emit Deposit event", async function () {
      const usdcAddress = await usdc.getAddress();
      await usdc.connect(user1).approve(await vault.getAddress(), DEPOSIT_AMOUNT);

      await expect(vault.connect(user1).deposit(usdcAddress, DEPOSIT_AMOUNT))
        .to.emit(vault, "Deposit")
        .withArgs(user1.address, usdcAddress, DEPOSIT_AMOUNT);
    });

    it("Should handle multiple deposits from same user", async function () {
      const usdcAddress = await usdc.getAddress();
      await usdc.connect(user1).approve(await vault.getAddress(), DEPOSIT_AMOUNT * 2n);

      await vault.connect(user1).deposit(usdcAddress, DEPOSIT_AMOUNT);
      await vault.connect(user1).deposit(usdcAddress, DEPOSIT_AMOUNT);

      expect(await vault.balanceOf(user1.address, usdcAddress)).to.equal(DEPOSIT_AMOUNT * 2n);
    });

    it("Should handle deposits from multiple users", async function () {
      const usdcAddress = await usdc.getAddress();

      await usdc.connect(user1).approve(await vault.getAddress(), DEPOSIT_AMOUNT);
      await usdc.connect(user2).approve(await vault.getAddress(), DEPOSIT_AMOUNT);

      await vault.connect(user1).deposit(usdcAddress, DEPOSIT_AMOUNT);
      await vault.connect(user2).deposit(usdcAddress, DEPOSIT_AMOUNT);

      expect(await vault.balanceOf(user1.address, usdcAddress)).to.equal(DEPOSIT_AMOUNT);
      expect(await vault.balanceOf(user2.address, usdcAddress)).to.equal(DEPOSIT_AMOUNT);
      expect(await vault.totalDeposits(usdcAddress)).to.equal(DEPOSIT_AMOUNT * 2n);
    });

    it("Should revert when depositing unsupported token", async function () {
      const usdtAddress = await usdt.getAddress();
      await usdt.connect(user1).approve(await vault.getAddress(), DEPOSIT_AMOUNT);

      await expect(
        vault.connect(user1).deposit(usdtAddress, DEPOSIT_AMOUNT)
      ).to.be.revertedWithCustomError(vault, "TokenNotSupported");
    });

    it("Should revert when depositing zero amount", async function () {
      const usdcAddress = await usdc.getAddress();
      await expect(
        vault.connect(user1).deposit(usdcAddress, 0)
      ).to.be.revertedWithCustomError(vault, "ZeroAmount");
    });
  });

  describe("Withdrawals", function () {
    beforeEach(async function () {
      const usdcAddress = await usdc.getAddress();
      await usdc.connect(user1).approve(await vault.getAddress(), DEPOSIT_AMOUNT);
      await vault.connect(user1).deposit(usdcAddress, DEPOSIT_AMOUNT);
    });

    it("Should allow withdrawals", async function () {
      const usdcAddress = await usdc.getAddress();
      const withdrawAmount = ethers.parseUnits("500", 6);

      const balanceBefore = await usdc.balanceOf(user1.address);
      await vault.connect(user1).withdraw(usdcAddress, withdrawAmount);
      const balanceAfter = await usdc.balanceOf(user1.address);

      expect(await vault.balanceOf(user1.address, usdcAddress)).to.equal(
        DEPOSIT_AMOUNT - withdrawAmount
      );
      expect(balanceAfter - balanceBefore).to.equal(withdrawAmount);
    });

    it("Should emit Withdrawal event", async function () {
      const usdcAddress = await usdc.getAddress();
      const withdrawAmount = ethers.parseUnits("500", 6);

      await expect(vault.connect(user1).withdraw(usdcAddress, withdrawAmount))
        .to.emit(vault, "Withdrawal")
        .withArgs(user1.address, usdcAddress, withdrawAmount);
    });

    it("Should allow full withdrawal", async function () {
      const usdcAddress = await usdc.getAddress();
      await vault.connect(user1).withdraw(usdcAddress, DEPOSIT_AMOUNT);

      expect(await vault.balanceOf(user1.address, usdcAddress)).to.equal(0);
      expect(await vault.totalDeposits(usdcAddress)).to.equal(0);
    });

    it("Should revert when withdrawing more than balance", async function () {
      const usdcAddress = await usdc.getAddress();
      const excessAmount = DEPOSIT_AMOUNT + 1n;

      await expect(
        vault.connect(user1).withdraw(usdcAddress, excessAmount)
      ).to.be.revertedWithCustomError(vault, "InsufficientBalance");
    });

    it("Should revert when withdrawing from empty balance", async function () {
      const usdcAddress = await usdc.getAddress();
      await expect(
        vault.connect(user2).withdraw(usdcAddress, DEPOSIT_AMOUNT)
      ).to.be.revertedWithCustomError(vault, "InsufficientBalance");
    });

    it("Should revert when withdrawing zero amount", async function () {
      const usdcAddress = await usdc.getAddress();
      await expect(
        vault.connect(user1).withdraw(usdcAddress, 0)
      ).to.be.revertedWithCustomError(vault, "ZeroAmount");
    });

    it("Should revert when withdrawing unsupported token", async function () {
      const usdtAddress = await usdt.getAddress();
      await expect(
        vault.connect(user1).withdraw(usdtAddress, DEPOSIT_AMOUNT)
      ).to.be.revertedWithCustomError(vault, "TokenNotSupported");
    });
  });

  describe("Balance Queries", function () {
    it("Should return correct balance for user", async function () {
      const usdcAddress = await usdc.getAddress();
      expect(await vault.balanceOf(user1.address, usdcAddress)).to.equal(0);

      await usdc.connect(user1).approve(await vault.getAddress(), DEPOSIT_AMOUNT);
      await vault.connect(user1).deposit(usdcAddress, DEPOSIT_AMOUNT);

      expect(await vault.balanceOf(user1.address, usdcAddress)).to.equal(DEPOSIT_AMOUNT);
    });

    it("Should return zero for user with no deposits", async function () {
      const usdcAddress = await usdc.getAddress();
      expect(await vault.balanceOf(user2.address, usdcAddress)).to.equal(0);
    });
  });
});
