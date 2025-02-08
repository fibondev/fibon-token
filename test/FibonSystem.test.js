const { ethers } = require("hardhat");
const { expect } = require("chai");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("Fibon Token System", function () {
    let token, ico, vesting, multisig;
    let owner, addr1, addr2, addr3, addr4, addr5, addr6, addr7, addr8;
    let tokenAddress, icoAddress, vestingAddress;
    let startTime, endTime;

    beforeEach(async function () {
        try {
            [owner, addr1, addr2, addr3, addr4, addr5, addr6, addr7, addr8] = await ethers.getSigners();
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
            token = await FibonToken.deploy(await multisig.getAddress(), await multisig.getAddress());
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
                ethers.parseEther("1000")
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

        it("Should handle transaction execution correctly", async function () {
            const value = ethers.parseEther("1");
            const initialBalance = await ethers.provider.getBalance(addr4.address);
            
            const tx = await multisig.connect(addr1).submitTransaction(
                addr4.address,
                value,
                "0x",
                { value: value }
            );
            const receipt = await tx.wait();
            const txId = receipt.logs[0].args[0];

            await multisig.connect(addr2).confirmTransaction(txId);
            
            const finalBalance = await ethers.provider.getBalance(addr4.address);
            expect(finalBalance - initialBalance).to.equal(value);
        });

        it("Should prevent duplicate confirmations", async function () {
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
            await expect(
                multisig.connect(addr3).confirmTransaction(txId)
            ).to.be.revertedWith("Transaction already executed");
        });

        it("Should prevent executing already executed transactions", async function () {
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
            
            await expect(
                multisig.connect(addr3).confirmTransaction(txId)
            ).to.be.revertedWith("Transaction already executed");
        });

        it("Should maintain correct confirmation tracking", async function () {
            const value = ethers.parseEther("1");
            const tx = await multisig.connect(addr1).submitTransaction(
                addr4.address,
                value,
                "0x",
                { value: value }
            );
            const receipt = await tx.wait();
            const txId = receipt.logs[0].args[0];

            const transaction = await multisig.transactions(txId);
            expect(transaction.confirmations).to.equal(1n);
        });

        it("Should execute transaction only with sufficient confirmations", async function () {
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
            expect(transaction.executed).to.be.true;
        });

        it("Should emit correct events", async function () {
            const value = ethers.parseEther("1");
            
            await expect(
                multisig.connect(addr1).submitTransaction(
                    addr4.address,
                    value,
                    "0x",
                    { value: value }
                )
            ).to.emit(multisig, "Submission");

            const tx = await multisig.connect(addr1).submitTransaction(
                addr4.address,
                value,
                "0x",
                { value: value }
            );
            const receipt = await tx.wait();
            const txId = receipt.logs[0].args[0];

            await expect(
                multisig.connect(addr2).confirmTransaction(txId)
            ).to.emit(multisig, "Confirmation")
            .and.to.emit(multisig, "Execution");
        });

        it("Should handle ETH deposits correctly", async function () {
            const depositAmount = ethers.parseEther("1");
            
            await expect(
                addr4.sendTransaction({
                    to: await multisig.getAddress(),
                    value: depositAmount
                })
            ).to.emit(multisig, "Deposit")
            .withArgs(addr4.address, depositAmount);

            expect(
                await ethers.provider.getBalance(await multisig.getAddress())
            ).to.equal(depositAmount);
        });

        it("Should handle withdrawal transactions correctly", async function () {
            const depositAmount = ethers.parseEther("2");
            const withdrawAmount = ethers.parseEther("1");
            
            await addr4.sendTransaction({
                to: await multisig.getAddress(),
                value: depositAmount
            });

            const tx = await multisig.connect(addr1).submitWithdrawal(
                addr5.address,
                withdrawAmount
            );
            const receipt = await tx.wait();
            const txId = receipt.logs[0].args[0];

            const initialBalance = await ethers.provider.getBalance(addr5.address);

            await multisig.connect(addr2).confirmTransaction(txId);

            const finalBalance = await ethers.provider.getBalance(addr5.address);
            expect(finalBalance - initialBalance).to.equal(withdrawAmount);
        });

        it("Should prevent withdrawals exceeding balance", async function () {
            const depositAmount = ethers.parseEther("1");
            const withdrawAmount = ethers.parseEther("2");
            
            await addr4.sendTransaction({
                to: await multisig.getAddress(),
                value: depositAmount
            });

            await expect(
                multisig.connect(addr1).submitWithdrawal(
                    addr5.address,
                    withdrawAmount
                )
            ).to.be.revertedWith("Insufficient balance");
        });

        it("Should handle complex contract interactions", async function () {
            const mintAmount = ethers.parseEther("1000");
            const mintData = token.interface.encodeFunctionData(
                "mint",
                [addr4.address, mintAmount]
            );

            const tx = await multisig.connect(addr1).submitTransaction(
                tokenAddress,
                0,
                mintData
            );
            const receipt = await tx.wait();
            const txId = receipt.logs[0].args[0];

            await multisig.connect(addr2).confirmTransaction(txId);
            expect(await token.balanceOf(addr4.address)).to.equal(mintAmount);
        });

        it("Should handle failed transactions correctly", async function () {
            const tx = await multisig.connect(addr1).submitTransaction(
                tokenAddress, 
                ethers.parseEther("1"),
                "0x",
                { value: ethers.parseEther("1") }
            );
            const receipt = await tx.wait();
            const txId = receipt.logs[0].args[0];

            await expect(
                multisig.connect(addr2).confirmTransaction(txId)
            ).to.emit(multisig, "ExecutionFailure")
            .withArgs(txId);

            const transaction = await multisig.transactions(txId);
            expect(transaction.executed).to.be.false;
        });

        it("Should handle multiple concurrent transactions", async function () {
            const destinations = [addr4, addr5, addr6];
            const value = ethers.parseEther("1");
            const txIds = [];

            for (const dest of destinations) {
                const tx = await multisig.connect(addr1).submitTransaction(
                    dest.address,
                    value,
                    "0x",
                    { value: value }
                );
                const receipt = await tx.wait();
                txIds.push(receipt.logs[0].args[0]);
            }

            for (const txId of txIds) {
                await multisig.connect(addr2).confirmTransaction(txId);
                const transaction = await multisig.transactions(txId);
                expect(transaction.executed).to.be.true;
            }

            for (const dest of destinations) {
                const balance = await ethers.provider.getBalance(dest.address);
                expect(balance).to.be.gt(0);
            }
        });

        it("Should reject invalid transaction data", async function () {
            await expect(
                addr4.sendTransaction({
                    to: await multisig.getAddress(),
                    data: "0x12345678", 
                    value: ethers.parseEther("1")
                })
            ).to.be.revertedWith("FibonMultiSig: Function does not exist or invalid data sent");
        });

        it("Should maintain correct transaction count", async function () {
            const initialCount = await multisig.transactionCount();
            
            for(let i = 0; i < 3; i++) {
                await multisig.connect(addr1).submitTransaction(
                    addr4.address,
                    ethers.parseEther("1"),
                    "0x",
                    { value: ethers.parseEther("1") }
                );
            }

            expect(await multisig.transactionCount()).to.equal(initialCount + 3n);
        });

        it("Should validate transaction value matches sent ETH", async function () {
            await expect(
                multisig.connect(addr1).submitTransaction(
                    addr4.address,
                    ethers.parseEther("2"),
                    "0x",
                    { value: ethers.parseEther("1") }
                )
            ).to.be.revertedWith("ETH value must match transaction value");
        });

        it("Should handle zero-value transactions", async function () {
            const tx = await multisig.connect(addr1).submitTransaction(
                addr4.address,
                0,
                "0x"
            );
            const receipt = await tx.wait();
            const txId = receipt.logs[0].args[0];

            await multisig.connect(addr2).confirmTransaction(txId);
            
            const transaction = await multisig.transactions(txId);
            expect(transaction.executed).to.be.true;
        });

        it("Should maintain transaction data integrity", async function () {
            const destination = addr4.address;
            const value = ethers.parseEther("1");
            const data = "0x1234";

            const tx = await multisig.connect(addr1).submitTransaction(
                destination,
                value,
                data,
                { value: value }
            );
            const receipt = await tx.wait();
            const txId = receipt.logs[0].args[0];

            const transaction = await multisig.transactions(txId);
            expect(transaction.destination).to.equal(destination);
            expect(transaction.value).to.equal(value);
            expect(transaction.data).to.equal(data);
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
            const burnAmount = ethers.parseEther("500000");

            const mintData = token.interface.encodeFunctionData("mint", [addr4.address, mintAmount]);
            await multisig.connect(addr1).submitTransaction(tokenAddress, 0, mintData);
            await multisig.connect(addr2).confirmTransaction(0);

            await token.connect(addr4).approve(await multisig.getAddress(), burnAmount);

            const burnData = token.interface.encodeFunctionData("burnFrom", [addr4.address, burnAmount]);
            await multisig.connect(addr1).submitTransaction(tokenAddress, 0, burnData);
            await multisig.connect(addr2).confirmTransaction(1);

            expect(await token.balanceOf(addr4.address)).to.equal(mintAmount - burnAmount);
        });
    });

    describe("ICO Tests with MultiSig", function () {
        let nextTxId = 0;

        beforeEach(async function () {
            nextTxId = 0;
            const mintAmount = ethers.parseEther("1000000");
            const mintData = token.interface.encodeFunctionData("mint", [icoAddress, mintAmount]);
            await multisig.connect(addr1).submitTransaction(tokenAddress, 0, mintData);
            await multisig.connect(addr2).confirmTransaction(nextTxId++);

            const approveData = token.interface.encodeFunctionData("approve", [icoAddress, mintAmount]);
            await multisig.connect(addr1).submitTransaction(tokenAddress, 0, approveData);
            await multisig.connect(addr2).confirmTransaction(nextTxId++);
        });

        it("Should allow buying tokens in pre-launch phase", async function () {
            await time.increaseTo(startTime + 1);
            const buyAmount = ethers.parseEther("1");

            await ico.connect(addr4).buyTokens(0, { value: buyAmount });

            const preLaunchInfo = await ico.preLaunchSale();
            expect(preLaunchInfo.sold).to.equal(buyAmount * 10n);
        });

        it("Should enforce phase supply limits", async function () {
            const latestTime = await time.latest();
            await time.setNextBlockTimestamp(latestTime + 3600);
            await ethers.provider.send("evm_mine");
            
            const initialPurchase = ethers.parseEther("1");
            await ico.connect(addr4).buyTokens(0, { value: initialPurchase });
            
            const hardCap = await ico.hardCap();
            const overflowAmount = hardCap - initialPurchase + ethers.parseEther("1");
            
            await expect(
                ico.connect(addr5).buyTokens(0, { value: overflowAmount })
            ).to.be.revertedWith("Hard cap reached");
        });
    });

    describe("Vesting Tests with MultiSig", function () {
        let nextTxId;

        beforeEach(async function () {
            nextTxId = 0;

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
                    percentage: 20
                },
                {
                    start: 30 * 24 * 3600,
                    end: 60 * 24 * 3600,
                    percentage: 35
                },
                {
                    start: 60 * 24 * 3600,
                    end: 90 * 24 * 3600,
                    percentage: 45
                }
            ];

            const addTypeData = vesting.interface.encodeFunctionData("addVestingType", [9, phases]);
            await multisig.connect(addr1).submitTransaction(vestingAddress, 0, addTypeData);
            await multisig.connect(addr2).confirmTransaction(nextTxId++);

            const firstPhase = await vesting.vestingTypes(9, 0);
            const secondPhase = await vesting.vestingTypes(9, 1);
            const thirdPhase = await vesting.vestingTypes(9, 2);


            expect(firstPhase.percentage).to.equal(20);
            expect(secondPhase.percentage).to.equal(35);
            expect(thirdPhase.percentage).to.equal(45);
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

            const disableData = vesting.interface.encodeFunctionData(
                "disableVestingSchedule",
                [addr4.address, true]
            );
            await multisig.connect(addr1).submitTransaction(vestingAddress, 0, disableData);
            await multisig.connect(addr2).confirmTransaction(nextTxId++);

            const schedule = await vesting.vestingSchedules(addr4.address);
            expect(schedule.isDisabled).to.be.true;
        });

        it("Should validate phase durations correctly", async function () {
            const invalidPhases = [
                {
                    start: 100,
                    end: 50, 
                    percentage: 100
                }
            ];

            const addTypeData = vesting.interface.encodeFunctionData("addVestingType", [100, invalidPhases]);
            await multisig.connect(addr1).submitTransaction(vestingAddress, 0, addTypeData);
            
            await expect(
                multisig.connect(addr2).confirmTransaction(nextTxId++)
            ).to.emit(multisig, "ExecutionFailure");
        });
    });

    describe("System Integration Tests", function () {
        let nextTxId;

        beforeEach(async function () {
            nextTxId = 0;
            const mintAmount = ethers.parseEther("1000000");

            const mintIcoData = token.interface.encodeFunctionData("mint", [icoAddress, mintAmount]);
            await multisig.connect(addr1).submitTransaction(tokenAddress, 0, mintIcoData);
            await multisig.connect(addr2).confirmTransaction(nextTxId++);

            const mintVestingData = token.interface.encodeFunctionData("mint", [vestingAddress, mintAmount]);
            await multisig.connect(addr1).submitTransaction(tokenAddress, 0, mintVestingData);
            await multisig.connect(addr2).confirmTransaction(nextTxId++);
        });

        it("Should handle complete ICO and Vesting flow", async function () {
            const latestTime = await time.latest();
            if (latestTime < startTime) {
                await time.increaseTo(startTime + 1);
            }

            const buyAmount = ethers.parseEther("1");
            await ico.connect(addr4).buyTokens(0, { value: buyAmount });

            const scheduleData = vesting.interface.encodeFunctionData(
                "createVestingSchedule",
                [addr4.address, 1, ethers.parseEther("10000")]
            );
            await multisig.connect(addr1).submitTransaction(vestingAddress, 0, scheduleData);
            await multisig.connect(addr2).confirmTransaction(nextTxId++);

            await time.increase(30 * 24 * 3600);

            const [vestedAmount, , releasable] = await vesting.getVestedAmount(addr4.address);
            expect(vestedAmount).to.be.above(0);
            expect(releasable).to.be.above(0);
        });
    });

    describe("Advanced Vesting Tests", function () {
        let nextTxId = 0;

        beforeEach(async function () {
            [owner, addr1, addr2, addr3, addr4, addr5, addr6, addr7, addr8] = await ethers.getSigners();
            const FibonMultiSig = await ethers.getContractFactory("FibonMultiSig");
            const owners = [addr1.address, addr2.address, addr3.address];
            multisig = await FibonMultiSig.deploy(owners, 2);
            await multisig.waitForDeployment();

            const FibonToken = await ethers.getContractFactory("FibonToken");
            token = await FibonToken.deploy(await multisig.getAddress(), await multisig.getAddress());
            await token.waitForDeployment();
            tokenAddress = await token.getAddress();

            const FibonVesting = await ethers.getContractFactory("FibonVesting");
            vesting = await FibonVesting.deploy(tokenAddress, await multisig.getAddress());
            await vesting.waitForDeployment();
            vestingAddress = await vesting.getAddress();

            nextTxId = 0;

            const mintAmount = ethers.parseEther("1000000");
            const mintData = token.interface.encodeFunctionData("mint", [vestingAddress, mintAmount]);
            await multisig.connect(addr1).submitTransaction(tokenAddress, 0, mintData);
            await multisig.connect(addr2).confirmTransaction(nextTxId++);

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

            const addTypeData = vesting.interface.encodeFunctionData("addVestingType", [1, phases]);
            await multisig.connect(addr1).submitTransaction(vestingAddress, 0, addTypeData);
            await multisig.connect(addr2).confirmTransaction(nextTxId++);

            const scheduleData = vesting.interface.encodeFunctionData(
                "createVestingSchedule",
                [addr4.address, 1, ethers.parseEther("10000")]
            );
            await multisig.connect(addr1).submitTransaction(vestingAddress, 0, scheduleData);
            await multisig.connect(addr2).confirmTransaction(nextTxId++);
        });

        it("Should properly calculate vested amounts before disabling", async function () {
            await time.increase(90 * 24 * 3600);

            const [totalVested, totalReleased, releasable] = await vesting.getVestedAmount(addr4.address);
            expect(totalVested).to.be.closeTo(
                ethers.parseEther("1000"),
                ethers.parseEther("1")
            );
        });

        it("Should properly redistribute vested and remaining amounts when disabling", async function () {
            await time.increase(90 * 24 * 3600);

            const [initialVested, , ] = await vesting.getVestedAmount(addr4.address);

            const earnedPercentage = (initialVested * 100n) / ethers.parseEther("10000");

            const disableData = vesting.interface.encodeFunctionData(
                "disableVestingSchedule",
                [addr4.address, true]
            );
            await multisig.connect(addr1).submitTransaction(vestingAddress, 0, disableData);
            await multisig.connect(addr2).confirmTransaction(nextTxId++);

            const schedule = await vesting.vestingSchedules(addr4.address);
            expect(schedule.isDisabled).to.be.true;

            const firstPhase = await vesting.vestingTypes(1, 0);
            expect(firstPhase.percentage).to.be.closeTo(
                Number(earnedPercentage / 3n + 20n),
                3
            );
        });

        it("Should handle time remainder distribution correctly", async function () {
            await time.increase(100 * 24 * 3600);

            const disableData = vesting.interface.encodeFunctionData(
                "disableVestingSchedule",
                [addr4.address, true]
            );
            await multisig.connect(addr1).submitTransaction(vestingAddress, 0, disableData);
            await multisig.connect(addr2).confirmTransaction(nextTxId++);

            const schedule = await vesting.vestingSchedules(addr4.address);

            const phases = await vesting.getSchedulePhases(addr4.address);

            const phaseLengths = phases.map(p => Number(p.end - p.start));
            const maxDiff = Math.max(...phaseLengths) - Math.min(...phaseLengths);
            expect(maxDiff).to.be.lte(2);
        });

        it("Should maintain total percentage at 100% after redistribution", async function () {
            await time.increase(90 * 24 * 3600);

            const disableData = vesting.interface.encodeFunctionData(
                "disableVestingSchedule",
                [addr4.address, true]
            );
            await multisig.connect(addr1).submitTransaction(vestingAddress, 0, disableData);
            await multisig.connect(addr2).confirmTransaction(nextTxId++);

            const phases = await vesting.getSchedulePhases(addr4.address);
            let totalPercentage = 0n;

            for(let i = 0; i < phases.length; i++) {
                totalPercentage += phases[i].percentage;
            }

            expect(totalPercentage).to.equal(100n);
        });

        it("Should not allow re-enabling a disabled schedule", async function () {
            const disableData = vesting.interface.encodeFunctionData(
                "disableVestingSchedule",
                [addr4.address, true]
            );
            await multisig.connect(addr1).submitTransaction(vestingAddress, 0, disableData);
            await multisig.connect(addr2).confirmTransaction(nextTxId++);

            let schedule = await vesting.vestingSchedules(addr4.address);
            expect(schedule.isDisabled).to.be.true;

            const enableData = vesting.interface.encodeFunctionData(
                "disableVestingSchedule",
                [addr4.address, false]
            );
            await multisig.connect(addr1).submitTransaction(vestingAddress, 0, enableData);
            await multisig.connect(addr2).confirmTransaction(nextTxId++);

            schedule = await vesting.vestingSchedules(addr4.address);
            expect(schedule.isDisabled).to.be.true;
        });

        it("Should calculate correct vested amounts at different time points", async function () {
            await time.increase(45 * 24 * 3600);
            let [totalVested, , releasable] = await vesting.getVestedAmount(addr4.address);
            expect(totalVested).to.be.closeTo(
                ethers.parseEther("500"),
                ethers.parseEther("1")
            );

            await time.increase(135 * 24 * 3600);
            [totalVested, , releasable] = await vesting.getVestedAmount(addr4.address);
            expect(totalVested).to.be.closeTo(
                ethers.parseEther("2000"),
                ethers.parseEther("1")
            );
        });

        it("Should handle multiple releases correctly", async function () {
            await time.increase(270 * 24 * 3600);

            await vesting.connect(addr4).release();
            const firstReleaseBalance = await token.balanceOf(addr4.address);

            await time.increase(180 * 24 * 3600);

            await vesting.connect(addr4).release();
            const secondReleaseBalance = await token.balanceOf(addr4.address);

            expect(secondReleaseBalance).to.be.gt(firstReleaseBalance);
        });

        it("Should prevent release when no tokens are available", async function () {
            await expect(
                vesting.connect(addr5).release()
            ).to.be.revertedWith("No vesting schedule for caller");

            const scheduleData = vesting.interface.encodeFunctionData(
                "createVestingSchedule",
                [addr5.address, 1, ethers.parseEther("1000")]
            );
            await multisig.connect(addr1).submitTransaction(vestingAddress, 0, scheduleData);
            await multisig.connect(addr2).confirmTransaction(nextTxId++);

            const disableData = vesting.interface.encodeFunctionData(
                "disableVestingSchedule",
                [addr5.address, true]
            );
            await multisig.connect(addr1).submitTransaction(vestingAddress, 0, disableData);
            await multisig.connect(addr2).confirmTransaction(nextTxId++);

            await expect(
                vesting.connect(addr5).release()
            ).to.be.revertedWith("Vesting schedule is disabled");
        });

        it("Should handle edge cases in vesting schedule", async function () {
            await time.increase(180 * 24 * 3600);
            const [vestedAtPhase1End, , ] = await vesting.getVestedAmount(addr4.address);

            await time.increase(1);
            const [vestedAfterPhase1, , ] = await vesting.getVestedAmount(addr4.address);

            expect(vestedAfterPhase1).to.be.gt(vestedAtPhase1End);
        });

        it("Should calculate correct vesting percentage", async function () {
            await time.increase(180 * 24 * 3600);
            const percentage = await vesting.getVestedPercentage(addr4.address);
            expect(percentage).to.be.closeTo(2000n, 10n);
        });

        it("Should handle revocation of unvested tokens", async function () {
            await time.increase(90 * 24 * 3600);

            const revokeData = vesting.interface.encodeFunctionData("revokeBeneficiary", [addr4.address]);
            await multisig.connect(addr1).submitTransaction(vestingAddress, 0, revokeData);
            await multisig.connect(addr2).confirmTransaction(nextTxId++);

            const schedule = await vesting.vestingSchedules(addr4.address);
            expect(schedule.startTime).to.equal(0);
        });

        it("Should properly handle disabled schedule releases", async function () {
            await time.increase(90 * 24 * 3600);

            const disableData = vesting.interface.encodeFunctionData(
                "disableVestingSchedule",
                [addr4.address, true]
            );
            await multisig.connect(addr1).submitTransaction(vestingAddress, 0, disableData);
            await multisig.connect(addr2).confirmTransaction(nextTxId++);

            await expect(
                vesting.connect(addr4).release()
            ).to.be.revertedWith("Vesting schedule is disabled");
        });

        it("Should validate phase transitions in disabled schedules", async function () {
            await time.increase(90 * 24 * 3600);

            const disableData = vesting.interface.encodeFunctionData(
                "disableVestingSchedule",
                [addr4.address, true]
            );
            await multisig.connect(addr1).submitTransaction(vestingAddress, 0, disableData);
            await multisig.connect(addr2).confirmTransaction(nextTxId++);

            const phases = await vesting.getSchedulePhases(addr4.address);
            for(let i = 1; i < phases.length; i++) {
                expect(phases[i].start).to.equal(phases[i-1].end);
            }
        });

        it("Should maintain correct token balances throughout vesting", async function () {
            const initialContractBalance = await token.balanceOf(vestingAddress);

            await time.increase(360 * 24 * 3600);
            await vesting.connect(addr4).release();

            const finalContractBalance = await token.balanceOf(vestingAddress);
            const beneficiaryBalance = await token.balanceOf(addr4.address);

            expect(initialContractBalance - finalContractBalance).to.equal(beneficiaryBalance);
        });

        it("Should handle concurrent vesting schedules", async function () {
            const testAddr1 = addr6;
            const testAddr2 = addr7;

            const mintAmount = ethers.parseEther("20000");
            const mintData = token.interface.encodeFunctionData("mint", [vestingAddress, mintAmount]);
            await multisig.connect(addr1).submitTransaction(tokenAddress, 0, mintData);
            await multisig.connect(addr2).confirmTransaction(nextTxId++);

            const latestTime = await time.latest();
            await time.setNextBlockTimestamp(latestTime + 1);

            const startTime = latestTime + 1;
            const halfTime = startTime + (180 * 24 * 3600);
            const endTime = startTime + (360 * 24 * 3600);

            const phases = [
                {
                    start: 0,
                    end: halfTime - startTime,
                    percentage: 50
                },
                {
                    start: halfTime - startTime,
                    end: endTime - startTime,
                    percentage: 50
                }
            ];

            const addTypeData = vesting.interface.encodeFunctionData("addVestingType", [2, phases]);
            await multisig.connect(addr1).submitTransaction(vestingAddress, 0, addTypeData);
            await multisig.connect(addr2).confirmTransaction(nextTxId++);

            const amount = ethers.parseEther("10000");

            const schedule1Data = vesting.interface.encodeFunctionData(
                "createVestingSchedule",
                [testAddr1.address, 2, amount]
            );
            await multisig.connect(addr1).submitTransaction(vestingAddress, 0, schedule1Data);
            await multisig.connect(addr2).confirmTransaction(nextTxId++);

            const schedule2Data = vesting.interface.encodeFunctionData(
                "createVestingSchedule",
                [testAddr2.address, 2, amount]
            );
            await multisig.connect(addr1).submitTransaction(vestingAddress, 0, schedule2Data);
            await multisig.connect(addr2).confirmTransaction(nextTxId++);

            await time.increaseTo(halfTime);

            const [vested1, ,] = await vesting.getVestedAmount(testAddr1.address);
            const [vested2, ,] = await vesting.getVestedAmount(testAddr2.address);

            const expectedVested = ethers.parseEther("5000");
            expect(vested1).to.be.closeTo(expectedVested, ethers.parseEther("1000"));
            expect(vested2).to.be.closeTo(expectedVested, ethers.parseEther("1000"));
        });

        it("Should properly handle zero vesting periods", async function () {
            const phases = [
                {
                    start: 0,
                    end: 0,
                    percentage: 100
                }
            ];

            const addTypeData = vesting.interface.encodeFunctionData("addVestingType", [10, phases]);
            await multisig.connect(addr1).submitTransaction(vestingAddress, 0, addTypeData);
            await multisig.connect(addr2).confirmTransaction(nextTxId++);

            const scheduleData = vesting.interface.encodeFunctionData(
                "createVestingSchedule",
                [addr5.address, 10, ethers.parseEther("1000")]
            );
            await multisig.connect(addr1).submitTransaction(vestingAddress, 0, scheduleData);
            await multisig.connect(addr2).confirmTransaction(nextTxId++);

            const [vested, , ] = await vesting.getVestedAmount(addr5.address);
            expect(vested).to.equal(ethers.parseEther("1000"));
        });


        it("Should prevent unauthorized address operations", async function () {
            const phases = [
                {
                    start: 0n,
                    end: 30n * 24n * 3600n,
                    percentage: 100n
                }
            ];

            await expect(
                vesting.connect(addr4).addVestingType(100n, phases)
            ).to.be.revertedWithCustomError(vesting, "OwnableUnauthorizedAccount");

            await expect(
                vesting.connect(addr4).createVestingSchedule(addr5.address, 1n, ethers.parseEther("1000"))
            ).to.be.revertedWithCustomError(vesting, "OwnableUnauthorizedAccount");

            await expect(
                vesting.connect(addr4).disableVestingSchedule(addr5.address, true)
            ).to.be.revertedWithCustomError(vesting, "OwnableUnauthorizedAccount");
        });


        it("Should handle multiple address operations in batch", async function () {
            const batchAddresses = [addr4, addr5, addr6, addr7];
            const amount = ethers.parseEther("10000");
        
            for(const addr of batchAddresses) {
                const scheduleData = vesting.interface.encodeFunctionData(
                    "createVestingSchedule",
                    [addr.address, 1, amount]
                );
                await multisig.connect(addr1).submitTransaction(vestingAddress, 0, scheduleData);
                await multisig.connect(addr2).confirmTransaction(await multisig.transactionCount() - 1n);
            }
        
            for(const addr of batchAddresses) {
                const schedule = await vesting.vestingSchedules(addr.address);
                expect(schedule.startTime > 0n).to.be.true;
                expect(await vesting.totalAllocation(addr.address)).to.equal(amount);
            }
        });

        describe("Token Burn Authorization Tests", function () {
            beforeEach(async function () {
                const mintData = token.interface.encodeFunctionData(
                    "mint",
                    [addr4.address, ethers.parseEther("1000")]
                );
                await multisig.connect(addr1).submitTransaction(tokenAddress, 0, mintData);
                await multisig.connect(addr2).confirmTransaction(await multisig.transactionCount() - 1n);
            });

            it("Should prevent unauthorized burning of others' tokens", async function () {
                await expect(
                    token.connect(addr5).burn(ethers.parseEther("100"))
                ).to.be.revertedWithCustomError(token, "ERC20InsufficientBalance");

                await expect(
                    token.connect(addr5).burnFrom(addr4.address, ethers.parseEther("100"))
                ).to.be.revertedWithCustomError(token, "ERC20InsufficientAllowance");

                await token.connect(addr4).approve(addr5.address, ethers.parseEther("100"));
                const blacklistData = token.interface.encodeFunctionData(
                    "blacklistAddress",
                    [addr5.address]
                );
                await multisig.connect(addr1).submitTransaction(tokenAddress, 0, blacklistData);
                await multisig.connect(addr2).confirmTransaction(await multisig.transactionCount() - 1n);

                await expect(
                    token.connect(addr5).burnFrom(addr4.address, ethers.parseEther("100"))
                ).to.be.revertedWith("Spender is blacklisted");
            });
        });
    });

    describe("Token Blacklist Tests", function () {
        let nextTxId;

        beforeEach(async function () {
            nextTxId = 0;
            const mintData = token.interface.encodeFunctionData(
                "mint",
                [addr4.address, ethers.parseEther("1000")]
            );
            await multisig.connect(addr1).submitTransaction(tokenAddress, 0, mintData);
            await multisig.connect(addr2).confirmTransaction(nextTxId++);
        });

        it("Should handle blacklisting through MultiSig", async function () {
            const blacklistData = token.interface.encodeFunctionData(
                "blacklistAddress",
                [addr4.address]
            );
            await multisig.connect(addr1).submitTransaction(tokenAddress, 0, blacklistData);
            await multisig.connect(addr2).confirmTransaction(nextTxId++);

            expect(await token.isBlacklisted(addr4.address)).to.be.true;

            await expect(
                token.connect(addr4).transfer(addr5.address, ethers.parseEther("100"))
            ).to.be.revertedWith("Sender is blacklisted");

            await expect(
                token.connect(addr5).transfer(addr4.address, ethers.parseEther("100"))
            ).to.be.revertedWith("Recipient is blacklisted");

            const unblacklistData = token.interface.encodeFunctionData(
                "unblacklistAddress",
                [addr4.address]
            );
            await multisig.connect(addr1).submitTransaction(tokenAddress, 0, unblacklistData);
            await multisig.connect(addr2).confirmTransaction(nextTxId++);

            expect(await token.isBlacklisted(addr4.address)).to.be.false;

            await token.connect(addr4).transfer(addr5.address, ethers.parseEther("100"));
            expect(await token.balanceOf(addr5.address)).to.equal(ethers.parseEther("100"));
        });

        it("Should prevent burning by blacklisted addresses", async function () {
            const blacklistData = token.interface.encodeFunctionData(
                "blacklistAddress",
                [addr4.address]
            );
            await multisig.connect(addr1).submitTransaction(tokenAddress, 0, blacklistData);
            await multisig.connect(addr2).confirmTransaction(nextTxId++);

            await expect(
                token.connect(addr4).burn(ethers.parseEther("100"))
            ).to.be.revertedWith("Sender is blacklisted");
        });

        it("Should prevent burnFrom operations involving blacklisted addresses", async function () {
            await token.connect(addr4).approve(addr5.address, ethers.parseEther("500"));

            const blacklistSpenderData = token.interface.encodeFunctionData(
                "blacklistAddress",
                [addr5.address]
            );
            await multisig.connect(addr1).submitTransaction(tokenAddress, 0, blacklistSpenderData);
            await multisig.connect(addr2).confirmTransaction(nextTxId++);

            await expect(
                token.connect(addr5).burnFrom(addr4.address, ethers.parseEther("100"))
            ).to.be.revertedWith("Spender is blacklisted");

            const unblacklistSpenderData = token.interface.encodeFunctionData(
                "unblacklistAddress",
                [addr5.address]
            );
            await multisig.connect(addr1).submitTransaction(tokenAddress, 0, unblacklistSpenderData);
            await multisig.connect(addr2).confirmTransaction(nextTxId++);

            const blacklistOwnerData = token.interface.encodeFunctionData(
                "blacklistAddress",
                [addr4.address]
            );
            await multisig.connect(addr1).submitTransaction(tokenAddress, 0, blacklistOwnerData);
            await multisig.connect(addr2).confirmTransaction(nextTxId++);

            await expect(
                token.connect(addr5).burnFrom(addr4.address, ethers.parseEther("100"))
            ).to.be.revertedWith("Token owner is blacklisted");
        });

        it("Should prevent permit operations involving blacklisted addresses", async function () {
            const deadline = Math.floor(Date.now() / 1000) + 3600;
            const value = ethers.parseEther("100");

            const domain = {
                name: "FibonToken",
                version: "1",
                chainId: (await ethers.provider.getNetwork()).chainId,
                verifyingContract: tokenAddress
            };

            const types = {
                Permit: [
                    { name: "owner", type: "address" },
                    { name: "spender", type: "address" },
                    { name: "value", type: "uint256" },
                    { name: "nonce", type: "uint256" },
                    { name: "deadline", type: "uint256" }
                ]
            };

            const blacklistData = token.interface.encodeFunctionData(
                "blacklistAddress",
                [addr4.address]
            );
            await multisig.connect(addr1).submitTransaction(tokenAddress, 0, blacklistData);
            await multisig.connect(addr2).confirmTransaction(nextTxId++);

            const nonce = await token.nonces(addr4.address);
            const message = {
                owner: addr4.address,
                spender: addr5.address,
                value: value,
                nonce: nonce,
                deadline: deadline
            };

            const signature = await addr4.signTypedData(domain, types, message);
            const { v, r, s } = ethers.Signature.from(signature);

            await expect(
                token.permit(addr4.address, addr5.address, value, deadline, v, r, s)
            ).to.be.revertedWith("Owner is blacklisted");
        });
    });

    describe("Token Fee Tests", function () {
        let nextTxId;

        beforeEach(async function () {
            nextTxId = 0;
            const mintAmount = ethers.parseEther("10000");
            const mintData = token.interface.encodeFunctionData("mint", [addr4.address, mintAmount]);
            await multisig.connect(addr1).submitTransaction(tokenAddress, 0, mintData);
            await multisig.connect(addr2).confirmTransaction(nextTxId++);
        });

        it("Should collect fees on transfers", async function () {
            const fee = ethers.parseEther("10");
            const setFeeData = token.interface.encodeFunctionData("setTransferFee", [fee]);
            await multisig.connect(addr1).submitTransaction(tokenAddress, 0, setFeeData);
            await multisig.connect(addr2).confirmTransaction(nextTxId++);

            const transferAmount = ethers.parseEther("100");
            const initialBalance = await token.balanceOf(addr4.address);
            
            await token.connect(addr4).transfer(addr5.address, transferAmount);

            const multisigBalance = await token.balanceOf(await multisig.getAddress());
            const recipientBalance = await token.balanceOf(addr5.address);
            const senderFinalBalance = await token.balanceOf(addr4.address);

            expect(recipientBalance).to.equal(transferAmount - fee);
            expect(multisigBalance).to.equal(fee);
            expect(senderFinalBalance).to.equal(initialBalance - transferAmount);
        });

        it("Should collect fees on transferFrom", async function () {
            const fee = ethers.parseEther("10");
            const setFeeData = token.interface.encodeFunctionData("setTransferFee", [fee]);
            await multisig.connect(addr1).submitTransaction(tokenAddress, 0, setFeeData);
            await multisig.connect(addr2).confirmTransaction(nextTxId++);

            const transferAmount = ethers.parseEther("100");
            const initialBalance = await token.balanceOf(addr4.address);
            
            await token.connect(addr4).approve(addr5.address, transferAmount);
            await token.connect(addr5).transferFrom(addr4.address, addr6.address, transferAmount);

            const multisigBalance = await token.balanceOf(await multisig.getAddress());
            const recipientBalance = await token.balanceOf(addr6.address);
            const senderFinalBalance = await token.balanceOf(addr4.address);

            expect(recipientBalance).to.equal(transferAmount - fee);
            expect(multisigBalance).to.equal(fee);
            expect(senderFinalBalance).to.equal(initialBalance - transferAmount);
        });

        it("Should fail if balance insufficient for transfer + fee", async function () {
            const fee = ethers.parseEther("10");
            const setFeeData = token.interface.encodeFunctionData("setTransferFee", [fee]);
            await multisig.connect(addr1).submitTransaction(tokenAddress, 0, setFeeData);
            await multisig.connect(addr2).confirmTransaction(nextTxId++);

            await expect(
                token.connect(addr4).transfer(addr5.address, ethers.parseEther("5"))
            ).to.be.revertedWith("Amount less than fee");
        });

        it("Should fail if allowance insufficient for transfer + fee", async function () {
            const fee = ethers.parseEther("10");
            const setFeeData = token.interface.encodeFunctionData("setTransferFee", [fee]);
            await multisig.connect(addr1).submitTransaction(tokenAddress, 0, setFeeData);
            await multisig.connect(addr2).confirmTransaction(nextTxId++);

            const transferAmount = ethers.parseEther("100");
            await token.connect(addr4).approve(addr5.address, transferAmount - 1n);

            await expect(
                token.connect(addr5).transferFrom(addr4.address, addr6.address, transferAmount)
            ).to.be.revertedWith("Insufficient allowance");
        });
    });

    describe("ICO Advanced Tests", function () {
        let nextTxId;
        const PHASE_PRELAUNCH = 0;
        const PHASE_ICO1 = 1;
        const PHASE_ICO2 = 2;
        const PHASE_ICO3 = 3;

        beforeEach(async function () {
            const blockNum = await ethers.provider.getBlockNumber();
            const block = await ethers.provider.getBlock(blockNum);
            startTime = block.timestamp + 3600; 
            endTime = startTime + (180 * 24 * 3600); 

            const FibonICO = await ethers.getContractFactory("FibonICO");
            ico = await FibonICO.deploy(
                tokenAddress,
                10n,
                BigInt(startTime),
                BigInt(endTime),
                ethers.parseEther("1000") 
            );
            await ico.waitForDeployment();
            icoAddress = await ico.getAddress();

            nextTxId = 0;
            const mintAmount = ethers.parseEther("200000000"); 
            const mintData = token.interface.encodeFunctionData("mint", [icoAddress, mintAmount]);
            await multisig.connect(addr1).submitTransaction(tokenAddress, 0, mintData);
            await multisig.connect(addr2).confirmTransaction(nextTxId++);

            await time.increaseTo(startTime - 60); 
        });

        it("Should enforce minimum purchase amount", async function () {
            await time.increaseTo(startTime + 1);
            await expect(
                ico.connect(addr4).buyTokens(PHASE_PRELAUNCH, { value: 0 })
            ).to.be.revertedWith("Must send ETH to buy tokens");
        });

        it("Should enforce phase supply limits", async function () {
            const latestTime = await time.latest();
            await time.setNextBlockTimestamp(latestTime + 3600); 
            await ethers.provider.send("evm_mine");
            
            const initialPurchase = ethers.parseEther("1");
            await ico.connect(addr4).buyTokens(PHASE_PRELAUNCH, { value: initialPurchase });
            
            const hardCap = await ico.hardCap();
            const overflowAmount = hardCap - initialPurchase + ethers.parseEther("1");
            
            await expect(
                ico.connect(addr5).buyTokens(PHASE_PRELAUNCH, { value: overflowAmount })
            ).to.be.revertedWith("Hard cap reached");
        });

        it("Should handle concurrent purchases in same phase", async function () {
            await time.increaseTo(startTime + 1);
            const purchaseAmount = ethers.parseEther("1");
            
            await Promise.all([
                ico.connect(addr4).buyTokens(PHASE_PRELAUNCH, { value: purchaseAmount }),
                ico.connect(addr5).buyTokens(PHASE_PRELAUNCH, { value: purchaseAmount }),
                ico.connect(addr6).buyTokens(PHASE_PRELAUNCH, { value: purchaseAmount })
            ]);

            expect(await ico.totalRaised()).to.equal(purchaseAmount * 3n);
        });

        it("Should properly track individual phase sales", async function () {
            await time.increaseTo(startTime + 1);
            const purchaseAmount = ethers.parseEther("1");
            
            await ico.connect(addr4).buyTokens(PHASE_PRELAUNCH, { value: purchaseAmount });
            const prelaunch = await ico.preLaunchSale();
            expect(prelaunch.sold).to.equal(purchaseAmount * 10n);

            await time.increaseTo(startTime + (31 * 24 * 3600));
            await ico.connect(addr4).buyTokens(PHASE_ICO1, { value: purchaseAmount });
            const ico1 = await ico.ico1();
            expect(ico1.sold).to.equal(purchaseAmount * 10n);
        });

        it("Should handle partial vesting claims", async function () {
            await time.increaseTo(startTime + 1);
            const purchaseAmount = ethers.parseEther("10");
            
            await ico.connect(addr4).buyTokens(PHASE_PRELAUNCH, { value: purchaseAmount });
            
            const prelaunch = await ico.preLaunchSale();
            const cliffEnd = prelaunch.endTime + await ico.preLaunchCliff();
            const vestingPeriod = await ico.preLaunchVesting();
            
            await time.increaseTo(cliffEnd + (vestingPeriod / 4n));
            
            await ico.connect(addr4).claimPreLaunchTokens();
            const firstClaim = await token.balanceOf(addr4.address);
            
            await time.increaseTo(cliffEnd + (vestingPeriod * 3n / 4n));
            
            await ico.connect(addr4).claimPreLaunchTokens();
            const secondClaim = await token.balanceOf(addr4.address);
            
            expect(secondClaim).to.be.gt(firstClaim);
            expect(secondClaim).to.be.lt(purchaseAmount * 10n);
        });

        it("Should prevent claims after vesting schedule is complete", async function () {
            await time.increaseTo(startTime + 1);
            const purchaseAmount = ethers.parseEther("1");
            
            await ico.connect(addr4).buyTokens(PHASE_PRELAUNCH, { value: purchaseAmount });
            
            const prelaunch = await ico.preLaunchSale();
            const cliffEnd = prelaunch.endTime + await ico.preLaunchCliff();
            const vestingPeriod = await ico.preLaunchVesting();
            
            await time.increaseTo(cliffEnd + vestingPeriod + 1n);
            
            await ico.connect(addr4).claimPreLaunchTokens();
            
            await expect(
                ico.connect(addr4).claimPreLaunchTokens()
            ).to.be.revertedWith("No tokens to claim");
        });

        it("Should correctly calculate claimable amounts during vesting", async function () {
            await time.increaseTo(startTime + 1);
            const purchaseAmount = ethers.parseEther("1");
            
            await ico.connect(addr4).buyTokens(PHASE_PRELAUNCH, { value: purchaseAmount });
            
            const phase = await ico.preLaunchSale();
            const cliffEnd = phase.endTime + await ico.preLaunchCliff();
            await time.increaseTo(cliffEnd + 1n);
            
            const vestingPeriod = await ico.preLaunchVesting();
            await time.increaseTo(cliffEnd + (vestingPeriod * 25n / 100n)); 
            const quarterVested = await ico.calculateClaimableAmount(addr4.address);
            
            await time.increaseTo(cliffEnd + (vestingPeriod * 50n / 100n)); 
            const halfVested = await ico.calculateClaimableAmount(addr4.address);
            
            expect(halfVested).to.be.gt(quarterVested);
        });

        it("Should handle multiple claims during vesting period", async function () {
            await time.increaseTo(startTime + 1);
            const purchaseAmount = ethers.parseEther("1");
            
            await ico.connect(addr4).buyTokens(PHASE_PRELAUNCH, { value: purchaseAmount });
            
            const phase = await ico.preLaunchSale();
            const cliffEnd = phase.endTime + await ico.preLaunchCliff();
            await time.increaseTo(cliffEnd + 1n);
            
            await ico.connect(addr4).claimPreLaunchTokens();
            const firstClaim = await ico.claimedTokens(addr4.address);
            
            await time.increase(30n * 24n * 3600n); 
            await ico.connect(addr4).claimPreLaunchTokens();
            const secondClaim = await ico.claimedTokens(addr4.address);
            
            expect(secondClaim).to.be.gt(firstClaim);
        });

        it("Should enforce ICO phase transitions", async function () {
            await time.increaseTo(startTime + 1);
            await ico.connect(addr4).buyTokens(PHASE_PRELAUNCH, { value: ethers.parseEther("1") });
            
            await time.increaseTo(startTime + 31 * 24 * 3600);
            await ico.connect(addr4).buyTokens(PHASE_ICO1, { value: ethers.parseEther("1") });
            
            await time.increaseTo(startTime + 61 * 24 * 3600);
            await ico.connect(addr4).buyTokens(PHASE_ICO2, { value: ethers.parseEther("1") });
            
            await time.increaseTo(startTime + 91 * 24 * 3600);
            await ico.connect(addr4).buyTokens(PHASE_ICO3, { value: ethers.parseEther("1") });
        });

        it("Should prevent purchases outside phase windows", async function () {
            await expect(
                ico.connect(addr4).buyTokens(PHASE_PRELAUNCH, { value: ethers.parseEther("1") })
            ).to.be.revertedWith("ICO is not active");
            
            await time.increaseTo(startTime + 31 * 24 * 3600);
            await expect(
                ico.connect(addr4).buyTokens(PHASE_PRELAUNCH, { value: ethers.parseEther("1") })
            ).to.be.revertedWith("Phase is not active");
        });

        it("Should handle owner functions correctly", async function () {
            const newRate = 20n;
            await ico.updateRate(newRate);
            expect(await ico.rate()).to.equal(newRate);
            
            const newCliff = 180 * 24 * 3600;
            await ico.updateCliffPeriod(newCliff);
            expect(await ico.preLaunchCliff()).to.equal(newCliff);
            
            const newVesting = 360 * 24 * 3600; 
            await ico.updateVestingPeriod(newVesting);
            expect(await ico.preLaunchVesting()).to.equal(newVesting);
        });

        it("Should prevent unauthorized access to owner functions", async function () {
            await expect(
                ico.connect(addr4).updateRate(20n)
            ).to.be.revertedWithCustomError(ico, "OwnableUnauthorizedAccount");
            
            await expect(
                ico.connect(addr4).updateCliffPeriod(180 * 24 * 3600)
            ).to.be.revertedWithCustomError(ico, "OwnableUnauthorizedAccount");
            
            await expect(
                ico.connect(addr4).updateVestingPeriod(360 * 24 * 3600)
            ).to.be.revertedWithCustomError(ico, "OwnableUnauthorizedAccount");
        });

        it("Should handle ETH withdrawals correctly", async function () {
            await time.increaseTo(startTime + 1);
            await ico.connect(addr4).buyTokens(PHASE_PRELAUNCH, { value: ethers.parseEther("1") });
            
            await expect(
                ico.withdrawFunds(addr1.address)
            ).to.be.revertedWith("ICO has not ended yet");
            
            await time.increaseTo(endTime + 1);
            
            const initialBalance = await ethers.provider.getBalance(addr1.address);
            await ico.withdrawFunds(addr1.address);
            const finalBalance = await ethers.provider.getBalance(addr1.address);
            
            expect(finalBalance).to.be.gt(initialBalance);
        });

        it("Should track total raised amount correctly", async function () {
            await time.increaseTo(startTime + 1);
            const purchase1 = ethers.parseEther("1");
            const purchase2 = ethers.parseEther("2");
            
            await ico.connect(addr4).buyTokens(PHASE_PRELAUNCH, { value: purchase1 });
            await ico.connect(addr5).buyTokens(PHASE_PRELAUNCH, { value: purchase2 });
            
            expect(await ico.totalRaised()).to.equal(purchase1 + purchase2);
        });

        it("Should handle receive function", async function () {
            await time.increaseTo(startTime + 1);
            
            const tx = {
                to: icoAddress,
                value: ethers.parseEther("1")
            };
            
            await addr4.sendTransaction(tx);
            
            const balance = await ethers.provider.getBalance(icoAddress);
            expect(balance).to.equal(ethers.parseEther("1"));
        });

        it("Should revert on fallback function", async function () {
            const invalidData = "0x12345678";
            await expect(
                addr4.sendTransaction({
                    to: icoAddress,
                    data: invalidData,
                    value: ethers.parseEther("1")
                })
            ).to.be.revertedWith("FibonICO: Function does not exist or invalid data sent");
        });

        it("Should revert on invalid phase", async function () {
            await time.increaseTo(startTime + 1);
            
            await expect(
                ico.connect(addr4).buyTokens(4, { value: ethers.parseEther("1") })
            ).to.be.revertedWith("Invalid phase");
            
            await time.increaseTo(startTime + 31 * 24 * 3600);
            await expect(
                ico.connect(addr4).buyTokens(PHASE_PRELAUNCH, { value: ethers.parseEther("1") })
            ).to.be.revertedWith("Phase is not active");
        });

        it("Should handle zero token claims", async function () {
            await time.increaseTo(startTime + 1);
            
            await expect(
                ico.connect(addr4).claimPreLaunchTokens()
            ).to.be.revertedWith("No tokens to claim");
        });

        it("Should prevent extending end time backwards", async function () {
            await expect(
                ico.extendEndTime(BigInt(endTime) - 1n)
            ).to.be.revertedWith("New end time must be after current end time");
        });

        it("Should prevent zero periods in cliff and vesting updates", async function () {
            await expect(
                ico.updateCliffPeriod(0)
            ).to.be.revertedWith("Cliff period must be greater than 0");

            await expect(
                ico.updateVestingPeriod(0)
            ).to.be.revertedWith("Vesting period must be greater than 0");
        });

        it("Should prevent withdrawing to zero address", async function () {
            await time.increaseTo(endTime + 1);
            
            await expect(
                ico.withdrawFunds(ethers.ZeroAddress)
            ).to.be.revertedWith("Invalid recipient address");
        });

        it("Should emit events on rate and time updates", async function () {
            const newRate = 20n;
            await expect(ico.updateRate(newRate))
                .to.emit(ico, "RateUpdated")
                .withArgs(newRate);

            const newEndTime = BigInt(endTime) + (30n * 24n * 3600n);
            await expect(ico.extendEndTime(newEndTime))
                .to.emit(ico, "TimesUpdated")
                .withArgs(BigInt(startTime), newEndTime);
        });

        it("Should emit events on token purchase and claims", async function () {
            const startTimeNum = Number(startTime);
            await time.increaseTo(startTimeNum + 1);
            
            const purchaseAmount = ethers.parseEther("1");
            const rate = await ico.rate();
            const expectedTokens = purchaseAmount * BigInt(rate);
            
            await expect(ico.connect(addr4).buyTokens(0, { value: purchaseAmount }))
                .to.emit(ico, "TokensPurchased")
                .withArgs(
                    addr4.address,
                    expectedTokens,
                    purchaseAmount,
                    0
                );

            const phase = await ico.preLaunchSale();
            const cliffPeriod = await ico.preLaunchCliff();
            const vestingPeriod = await ico.preLaunchVesting();
            
            const cliffEnd = BigInt(phase.endTime) + BigInt(cliffPeriod);
            await time.increaseTo(Number(cliffEnd) + Number(vestingPeriod) / 4);
            
            const expectedClaimable = 2500001286008230452n;
            
            await expect(ico.connect(addr4).claimPreLaunchTokens())
                .to.emit(ico, "TokensClaimed")
                .withArgs(addr4.address, expectedClaimable);
        });

        it("Should handle multiple phase transitions with correct timing", async function () {
            await time.increaseTo(BigInt(startTime) + 1n);
            await ico.connect(addr4).buyTokens(PHASE_PRELAUNCH, { value: ethers.parseEther("1") });
            
            await time.increaseTo(BigInt(startTime) + (30n * 24n * 3600n) + 1n);
            await ico.connect(addr4).buyTokens(PHASE_ICO1, { value: ethers.parseEther("1") });
            
            await time.increaseTo(BigInt(startTime) + (60n * 24n * 3600n) + 1n);
            await ico.connect(addr4).buyTokens(PHASE_ICO2, { value: ethers.parseEther("1") });
            
            await time.increaseTo(BigInt(startTime) + (90n * 24n * 3600n) + 1n);
            await ico.connect(addr4).buyTokens(PHASE_ICO3, { value: ethers.parseEther("1") });
            
            const phase0 = await ico.preLaunchSale();
            const phase1 = await ico.ico1();
            const phase2 = await ico.ico2();
            const phase3 = await ico.ico3();
            
            expect(phase0.sold).to.equal(ethers.parseEther("10"));
            expect(phase1.sold).to.equal(ethers.parseEther("10"));
            expect(phase2.sold).to.equal(ethers.parseEther("10"));
            expect(phase3.sold).to.equal(ethers.parseEther("10"));
        });
    });

    describe("Additional Vesting Coverage Tests", function () {
        let nextTxId;

        beforeEach(async function () {
            nextTxId = 0;
            const mintAmount = ethers.parseEther("1000000");
            const mintData = token.interface.encodeFunctionData("mint", [vestingAddress, mintAmount]);
            await multisig.connect(addr1).submitTransaction(tokenAddress, 0, mintData);
            await multisig.connect(addr2).confirmTransaction(nextTxId++);
        });

        it("Should validate phase durations correctly", async function () {
            const invalidPhases = [
                {
                    start: 100,
                    end: 50, 
                    percentage: 100
                }
            ];

            const addTypeData = vesting.interface.encodeFunctionData("addVestingType", [100, invalidPhases]);
            await multisig.connect(addr1).submitTransaction(vestingAddress, 0, addTypeData);
            
            await expect(
                multisig.connect(addr2).confirmTransaction(nextTxId++)
            ).to.emit(multisig, "ExecutionFailure");
        });

        it("Should handle zero allocation cases", async function () {
            const scheduleData = vesting.interface.encodeFunctionData(
                "createVestingSchedule",
                [addr5.address, 1, 0] 
            );
            await multisig.connect(addr1).submitTransaction(vestingAddress, 0, scheduleData);
            
            await expect(
                multisig.connect(addr2).confirmTransaction(nextTxId++)
            ).to.emit(multisig, "ExecutionFailure");

            const percentage = await vesting.getVestedPercentage(addr5.address);
            expect(percentage).to.equal(0);
        });

        it("Should validate total percentage equals 100", async function () {
            const invalidPhases = [
                {
                    start: 0,
                    end: 30 * 24 * 3600,
                    percentage: 60
                },
                {
                    start: 30 * 24 * 3600,
                    end: 60 * 24 * 3600,
                    percentage: 60 
                }
            ];

            const addTypeData = vesting.interface.encodeFunctionData("addVestingType", [101, invalidPhases]);
            await multisig.connect(addr1).submitTransaction(vestingAddress, 0, addTypeData);
            
            await expect(
                multisig.connect(addr2).confirmTransaction(nextTxId++)
            ).to.emit(multisig, "ExecutionFailure");
        });

        it("Should handle non-sequential phases correctly", async function () {
            const nonSequentialPhases = [
                {
                    start: 30 * 24 * 3600, 
                    end: 60 * 24 * 3600,
                    percentage: 50
                },
                {
                    start: 0, 
                    end: 30 * 24 * 3600,
                    percentage: 50
                }
            ];

            const addTypeData = vesting.interface.encodeFunctionData("addVestingType", [102, nonSequentialPhases]);
            await multisig.connect(addr1).submitTransaction(vestingAddress, 0, addTypeData);
            
            await expect(
                multisig.connect(addr2).confirmTransaction(nextTxId++)
            ).to.emit(multisig, "ExecutionFailure");
        });

        it("Should prevent creating duplicate vesting schedules", async function () {
            const scheduleData = vesting.interface.encodeFunctionData(
                "createVestingSchedule",
                [addr4.address, 1, ethers.parseEther("1000")]
            );
            await multisig.connect(addr1).submitTransaction(vestingAddress, 0, scheduleData);
            await multisig.connect(addr2).confirmTransaction(nextTxId++);

            await multisig.connect(addr1).submitTransaction(vestingAddress, 0, scheduleData);
            
            await expect(
                multisig.connect(addr2).confirmTransaction(nextTxId++)
            ).to.emit(multisig, "ExecutionFailure");
        });

        it("Should validate vesting type exists", async function () {
            const nonExistentTypeId = 99;
            const scheduleData = vesting.interface.encodeFunctionData(
                "createVestingSchedule",
                [addr4.address, nonExistentTypeId, ethers.parseEther("1000")]
            );
            await multisig.connect(addr1).submitTransaction(vestingAddress, 0, scheduleData);
            
            await expect(
                multisig.connect(addr2).confirmTransaction(nextTxId++)
            ).to.emit(multisig, "ExecutionFailure");
        });

        it("Should recover mistakenly sent tokens", async function () {
            const TestToken = await ethers.getContractFactory("FibonToken");
            const testToken = await TestToken.deploy(await multisig.getAddress(), await multisig.getAddress());
            await testToken.waitForDeployment();

            const mintData = testToken.interface.encodeFunctionData(
                "mint",
                [vestingAddress, ethers.parseEther("1000")]
            );
            await multisig.connect(addr1).submitTransaction(await testToken.getAddress(), 0, mintData);
            await multisig.connect(addr2).confirmTransaction(nextTxId++);

            const recoverData = vesting.interface.encodeFunctionData(
                "recoverERC20",
                [await testToken.getAddress(), ethers.parseEther("1000")]
            );
            await multisig.connect(addr1).submitTransaction(vestingAddress, 0, recoverData);
            await multisig.connect(addr2).confirmTransaction(nextTxId++);

            const balance = await testToken.balanceOf(await multisig.getAddress());
            expect(balance).to.equal(ethers.parseEther("1000"));
        });
    });
});