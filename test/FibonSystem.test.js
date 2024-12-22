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
            const mintAmount = ethers.parseEther("1000000");
            const mintData = token.interface.encodeFunctionData("mint", [addr4.address, mintAmount]);
            await multisig.connect(addr1).submitTransaction(tokenAddress, 0, mintData);
            await multisig.connect(addr2).confirmTransaction(nextTxId++);
        });

        it("Should set transfer fee through MultiSig", async function () {
            const newFee = ethers.parseEther("10");
            const setFeeData = token.interface.encodeFunctionData("setTransferFee", [newFee]);

            await multisig.connect(addr1).submitTransaction(tokenAddress, 0, setFeeData);
            await multisig.connect(addr2).confirmTransaction(nextTxId++);

            expect(await token.transferFee()).to.equal(newFee);
        });

        it("Should collect fees on transfers", async function () {
            const fee = ethers.parseEther("10");
            const setFeeData = token.interface.encodeFunctionData("setTransferFee", [fee]);
            await multisig.connect(addr1).submitTransaction(tokenAddress, 0, setFeeData);
            await multisig.connect(addr2).confirmTransaction(nextTxId++);

            const transferAmount = ethers.parseEther("100");
            await token.connect(addr4).transfer(addr5.address, transferAmount);

            const multisigBalance = await token.balanceOf(await multisig.getAddress());
            const recipientBalance = await token.balanceOf(addr5.address);

            expect(multisigBalance).to.equal(fee);
            expect(recipientBalance).to.equal(transferAmount);
        });

        it("Should collect fees on transferFrom", async function () {
            const fee = ethers.parseEther("10");
            const setFeeData = token.interface.encodeFunctionData("setTransferFee", [fee]);
            await multisig.connect(addr1).submitTransaction(tokenAddress, 0, setFeeData);
            await multisig.connect(addr2).confirmTransaction(nextTxId++);

            const transferAmount = ethers.parseEther("100");
            const totalAmount = transferAmount + fee;

            await token.connect(addr4).approve(addr5.address, totalAmount);
            await token.connect(addr5).transferFrom(addr4.address, addr6.address, transferAmount);

            const multisigBalance = await token.balanceOf(await multisig.getAddress());
            const recipientBalance = await token.balanceOf(addr6.address);

            expect(multisigBalance).to.equal(fee);
            expect(recipientBalance).to.equal(transferAmount);
        });

        it("Should not charge fee when sender is fee collector", async function () {
            const fee = ethers.parseEther("10");
            const setFeeData = token.interface.encodeFunctionData("setTransferFee", [fee]);
            await multisig.connect(addr1).submitTransaction(tokenAddress, 0, setFeeData);
            await multisig.connect(addr2).confirmTransaction(nextTxId++);

            const transferAmount = ethers.parseEther("100");
            await token.connect(addr4).transfer(await multisig.getAddress(), transferAmount);

            const transferData = token.interface.encodeFunctionData("transfer", [addr5.address, transferAmount]);
            await multisig.connect(addr1).submitTransaction(tokenAddress, 0, transferData);
            await multisig.connect(addr2).confirmTransaction(nextTxId++);

            const recipientBalance = await token.balanceOf(addr5.address);
            expect(recipientBalance).to.equal(transferAmount);
        });

        it("Should fail if balance insufficient for transfer + fee", async function () {
            const fee = ethers.parseEther("10");
            const setFeeData = token.interface.encodeFunctionData("setTransferFee", [fee]);
            await multisig.connect(addr1).submitTransaction(tokenAddress, 0, setFeeData);
            await multisig.connect(addr2).confirmTransaction(nextTxId++);

            const balance = await token.balanceOf(addr4.address);
            await expect(
                token.connect(addr4).transfer(addr5.address, balance)
            ).to.be.revertedWith("Insufficient balance for transfer with fee");
        });

        it("Should fail if allowance insufficient for transfer + fee", async function () {
            const fee = ethers.parseEther("10");
            const setFeeData = token.interface.encodeFunctionData("setTransferFee", [fee]);
            await multisig.connect(addr1).submitTransaction(tokenAddress, 0, setFeeData);
            await multisig.connect(addr2).confirmTransaction(nextTxId++);

            const transferAmount = ethers.parseEther("100");
            await token.connect(addr4).approve(addr5.address, transferAmount);

            await expect(
                token.connect(addr5).transferFrom(addr4.address, addr6.address, transferAmount)
            ).to.be.revertedWith("Insufficient allowance for transfer with fee");
        });
    });
});