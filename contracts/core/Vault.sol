// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title Vault
 * @notice Core vault contract for managing user deposits and withdrawals
 * @dev Supports ERC20 tokens as collateral
 */
contract Vault is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // Supported collateral tokens (e.g., USDC, USDT)
    mapping(address => bool) public supportedTokens;

    // User balances: user => token => balance
    mapping(address => mapping(address => uint256)) public userBalances;

    // Total deposits per token
    mapping(address => uint256) public totalDeposits;

    // Events
    event Deposit(address indexed user, address indexed token, uint256 amount);
    event Withdrawal(address indexed user, address indexed token, uint256 amount);
    event TokenAdded(address indexed token);
    event TokenRemoved(address indexed token);

    // Errors
    error TokenNotSupported();
    error InsufficientBalance();
    error ZeroAmount();
    error ZeroAddress();

    constructor() Ownable(msg.sender) {}

    /**
     * @notice Add a supported collateral token
     * @param token Address of the ERC20 token
     */
    function addSupportedToken(address token) external onlyOwner {
        if (token == address(0)) revert ZeroAddress();
        supportedTokens[token] = true;
        emit TokenAdded(token);
    }

    /**
     * @notice Remove a supported collateral token
     * @param token Address of the ERC20 token
     */
    function removeSupportedToken(address token) external onlyOwner {
        supportedTokens[token] = false;
        emit TokenRemoved(token);
    }

    /**
     * @notice Deposit tokens into the vault
     * @param token Address of the ERC20 token
     * @param amount Amount to deposit
     */
    function deposit(address token, uint256 amount) external nonReentrant {
        if (!supportedTokens[token]) revert TokenNotSupported();
        if (amount == 0) revert ZeroAmount();

        // Transfer tokens from user to vault
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);

        // Update balances
        userBalances[msg.sender][token] += amount;
        totalDeposits[token] += amount;

        emit Deposit(msg.sender, token, amount);
    }

    /**
     * @notice Withdraw tokens from the vault
     * @param token Address of the ERC20 token
     * @param amount Amount to withdraw
     */
    function withdraw(address token, uint256 amount) external nonReentrant {
        if (!supportedTokens[token]) revert TokenNotSupported();
        if (amount == 0) revert ZeroAmount();
        if (userBalances[msg.sender][token] < amount) revert InsufficientBalance();

        // Update balances
        userBalances[msg.sender][token] -= amount;
        totalDeposits[token] -= amount;

        // Transfer tokens to user
        IERC20(token).safeTransfer(msg.sender, amount);

        emit Withdrawal(msg.sender, token, amount);
    }

    /**
     * @notice Get user balance for a specific token
     * @param user Address of the user
     * @param token Address of the token
     * @return User's balance
     */
    function balanceOf(address user, address token) external view returns (uint256) {
        return userBalances[user][token];
    }

    /**
     * @notice Check if a token is supported
     * @param token Address of the token
     * @return True if supported
     */
    function isTokenSupported(address token) external view returns (bool) {
        return supportedTokens[token];
    }
}
