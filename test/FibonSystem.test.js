const { ethers } = require("hardhat");
const { expect } = require("chai");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("Fibon Token System", function () {
    let token, ico, vesting, multisig;
    let owner, addr1, addr2, addr3, addr4, addr5;
    let tokenAddress, icoAddress, vestingAddress;
    let startTime, endTime;

    beforeEach(async function () {
        try {
            console.log("Starting beforeEach...");
            [owner, addr1, addr2, addr3, addr4, addr5] = await ethers.getSigners();
            console.log("Got signers");

            const FibonMultiSig = await ethers.getContractFactory("FibonMultiSig");
            console.log("Got MultiSig factory");
            
            const owners = [addr1.address, addr2.address, addr3.address];
            console.log("Owners array:", owners);
            
            multisig = await FibonMultiSig.deploy(
                owners,    
                2         
            );
            console.log("MultiSig deployment initiated");
            
            await multisig.waitForDeployment();
            console.log("MultiSig deployment confirmed");

            const FibonToken = await ethers.getContractFactory("FibonToken");
            token = await FibonToken.deploy(await multisig.getAddress());
            await token.waitForDeployment();
            tokenAddress = await token.getAddress();
            console.log("Token deployed at:", tokenAddress);

            startTime = Math.floor(Date.now() / 1000) + 3600;
            endTime = startTime + (30 * 24 * 3600);

            const FibonICO = await ethers.getContractFactory("FibonICO");
            ico = await FibonICO.deploy(
                tokenAddress,            
                10n,                      
                BigInt(startTime),        
                BigInt(endTime),          
                ethers.parseEther("1")    
            );
            console.log("ICO deployment initiated");
            
            await ico.waitForDeployment();
            icoAddress = await ico.getAddress();
            console.log("ICO deployed at:", icoAddress);

            const FibonVesting = await ethers.getContractFactory("FibonVesting");
            vesting = await FibonVesting.deploy(
                tokenAddress,
                await multisig.getAddress()
            );
            await vesting.waitForDeployment();
            vestingAddress = await vesting.getAddress();
            console.log("Vesting deployed at:", vestingAddress);

        } catch (error) {
            console.error("Error in beforeEach:", error);
            throw error;
        }
    });

    describe("MultiSig Core Tests", function () {
        it("Should correctly initialize MultiSig", async function () {
            expect(await multisig.owners(0)).to.equal(addr1.address);
            expect(await multisig.owners(1)).to.equal(addr2.address);
            expect(await multisig.owners(2)).to.equal(addr3.address);
            expect(await multisig.required()).to.equal(2n);
        });

        it("Should submit and confirm transaction", async function () {
            const value = ethers.parseEther("1");
            const tx = await multisig.connect(addr1).submitTransaction(
                addr4.address, 
                value, 
                "0x",
                { value: value }
            );
            const receipt = await tx.wait();
            const txId = receipt.logs[0].args[0];
            
            await multisig.connect(addr2).confirmTransaction(txId);
            const transaction = await multisig.transactions(txId);
            expect(transaction.confirmations).to.equal(2n);
        });

        it("Should fail if non-owner tries to confirm", async function () {
            const value = ethers.parseEther("1");
            const tx = await multisig.connect(addr1).submitTransaction(
                addr4.address, 
                value, 
                "0x",
                { value: value }
            );
            const receipt = await tx.wait();
            const txId = receipt.logs[0].args[0];
            
            await expect(
                multisig.connect(addr4).confirmTransaction(txId)
            ).to.be.revertedWith("Not an owner");
        });
    });

    describe("Token Tests with MultiSig", function () {
        it("Should mint tokens through MultiSig", async function () {
            const mintAmount = ethers.parseEther("1000000");
            const mintData = token.interface.encodeFunctionData("mint", [icoAddress, mintAmount]);

            await multisig.connect(addr1).submitTransaction(tokenAddress, 0, mintData);
            await multisig.connect(addr2).confirmTransaction(0);

            expect(await token.balanceOf(icoAddress)).to.equal(mintAmount);
        });

        it("Should burn tokens through MultiSig", async function () {
            const mintAmount = ethers.parseEther("1000000");
            const mintData = token.interface.encodeFunctionData("mint", [addr4.address, mintAmount]);
            await multisig.connect(addr1).submitTransaction(tokenAddress, 0, mintData);
            await multisig.connect(addr2).confirmTransaction(0);

            const burnAmount = ethers.parseEther("500000");
            const burnData = token.interface.encodeFunctionData("burn", [burnAmount]);
            await token.connect(addr4).approve(tokenAddress, burnAmount);
            await multisig.connect(addr1).submitTransaction(tokenAddress, 0, burnData);
            await multisig.connect(addr2).confirmTransaction(1);

            expect(await token.balanceOf(addr4.address)).to.equal(mintAmount - burnAmount);
        });
    });

    describe("ICO Tests with MultiSig", function () {
        beforeEach(async function () {
            const mintAmount = ethers.parseEther("1000000");
            const mintData = token.interface.encodeFunctionData("mint", [icoAddress, mintAmount]);
            await multisig.connect(addr1).submitTransaction(tokenAddress, 0, mintData);
            await multisig.connect(addr2).confirmTransaction(0);

            const approveData = token.interface.encodeFunctionData("approve", [icoAddress, mintAmount]);
            await multisig.connect(addr1).submitTransaction(tokenAddress, 0, approveData);
            await multisig.connect(addr2).confirmTransaction(1);
        });

        it("Should allow buying tokens in pre-launch phase", async function () {
            await time.increaseTo(startTime + 1);
            const buyAmount = ethers.parseEther("1");
            await ico.connect(addr4).buyTokens({ value: buyAmount });
            
            const phase = await ico.preLaunchSale();
            expect(phase.totalSold).to.equal(buyAmount * 10n);
        });

        it("Should allow emergency stop through MultiSig", async function () {
            const stopData = ico.interface.encodeFunctionData("stop");
            await multisig.connect(addr1).submitTransaction(icoAddress, 0, stopData);
            await multisig.connect(addr2).confirmTransaction(0);

            await expect(
                ico.connect(addr4).buyTokens({ value: ethers.parseEther("1") })
            ).to.be.revertedWith("ICO is stopped");
        });
    });

    describe("Vesting Tests with MultiSig", function () {
        let nextTxId = 0;
        
        beforeEach(async function () {
            const mintAmount = ethers.parseEther("1000000");
            const mintData = token.interface.encodeFunctionData("mint", [vestingAddress, mintAmount]);
            await multisig.connect(addr1).submitTransaction(tokenAddress, 0, mintData);
            await multisig.connect(addr2).confirmTransaction(nextTxId++);
        });

        it("Should add vesting type through MultiSig", async function () {
            const phases = [
                {
                    start: 0,
                    end: 30 * 24 * 3600,
                    percentage: 30
                },
                {
                    start: 30 * 24 * 3600,
                    end: 60 * 24 * 3600,
                    percentage: 70
                }
            ];

            const addTypeData = vesting.interface.encodeFunctionData("addVestingType", [5, phases]);
            await multisig.connect(addr1).submitTransaction(vestingAddress, 0, addTypeData);
            await multisig.connect(addr2).confirmTransaction(nextTxId++);

            const firstPhase = await vesting.vestingTypes(5, 0);
            expect(firstPhase.percentage).to.equal(30);
        });

        it("Should create vesting schedule through MultiSig", async function () {
            const scheduleData = vesting.interface.encodeFunctionData(
                "createVestingSchedule",
                [addr4.address, 1, ethers.parseEther("10000")]
            );
            await multisig.connect(addr1).submitTransaction(vestingAddress, 0, scheduleData);
            await multisig.connect(addr2).confirmTransaction(nextTxId++);

            const schedule = await vesting.vestingSchedules(addr4.address);
            expect(schedule.isDisabled).to.be.false;
        });

        it("Should disable vesting schedule through MultiSig", async function () {
            const scheduleData = vesting.interface.encodeFunctionData(
                "createVestingSchedule",
                [addr4.address, 1, ethers.parseEther("10000")]
            );
            await multisig.connect(addr1).submitTransaction(vestingAddress, 0, scheduleData);
            await multisig.connect(addr2).confirmTransaction(nextTxId++);

            const disableData = vesting.interface.encodeFunctionData("disableVestingSchedule", [addr4.address]);
            await multisig.connect(addr1).submitTransaction(vestingAddress, 0, disableData);
            await multisig.connect(addr2).confirmTransaction(nextTxId++);

            const schedule = await vesting.vestingSchedules(addr4.address);
            expect(schedule.isDisabled).to.be.true;
        });
    });

    describe("System Integration Tests", function () {
        it("Should handle complete ICO and Vesting flow", async function () {
            const currentTime = await time.latest();
            startTime = currentTime + 3600;
            endTime = startTime + (30 * 24 * 3600);
            
            const icoMintData = token.interface.encodeFunctionData("mint", [icoAddress, ethers.parseEther("1000000")]);
            await multisig.connect(addr1).submitTransaction(tokenAddress, 0, icoMintData);
            await multisig.connect(addr2).confirmTransaction(0);

            await time.increaseTo(startTime + 10);
            await ico.connect(addr4).buyTokens({ value: ethers.parseEther("1") });

            const scheduleData = vesting.interface.encodeFunctionData(
                "createVestingSchedule",
                [addr4.address, 1, ethers.parseEther("1000")]
            );
            await multisig.connect(addr1).submitTransaction(vestingAddress, 0, scheduleData);
            await multisig.connect(addr2).confirmTransaction(1);

            await time.increase(180 * 24 * 3600); 
            await vesting.connect(addr4).release();

            const balance = await token.balanceOf(addr4.address);
            expect(balance).to.be.gt(0);
        });
    });
}); 