module.exports = function(grunt)
{
	"use strict";

	var Papa = require("papaparse");

	const buildNumberFile = "nextBuildNumber.txt";
	const cacheBusterVariableName = "build";
	const buildNumber = parseInt(grunt.file.read(buildNumberFile));
	grunt.file.write(buildNumberFile, buildNumber + 1); // Update the next build number


	function stripMinOrFull(dest, src)
	{
		var fullOriginalDest = dest + src,
			testExp = /(.*)(\.min|\.full)(\..+)/,
			testResult = testExp.exec(fullOriginalDest),
			outputFile = (testResult === null) ? fullOriginalDest : (testResult[1] + testResult[3]);

		console.log("copying " + fullOriginalDest + " to " + outputFile);

		return outputFile;
	} // end stripMinOrFull()


	function htmlTagWithBuildNumberURL(originalTag, originalUrl, cacheBusterVariableName, buildNumber)
	{
		/*
		if no server name
			add build number at end before named anchor (if there is one)
		else if concertjs.com server name
			working with section after server name and trailing slash,
			add build number at end before named anchor (if there is one)
		else
			don't add build number
		*/
		
		let concertjsServerUrlRegExp = /^(https?:\/\/(?:www.)?concertjs.com)($|((?:\/[^#\n\r\?]+)*\/)?(?:([^#\n\r\?]+)(\?[^#\n\r\?]*)?(#.*)?)$)/,
			finalUrl, finalTag;
		
		if(originalUrl.indexOf(":") < 0)
		{
			let namedAnchorPosition = originalUrl.indexOf("#"),
				existingArgumentsPosition = originalUrl.indexOf("?"),
				argumentsExist = (existingArgumentsPosition > -1),
				newArgString = (argumentsExist ? "&" : "?") + cacheBusterVariableName + "=" + buildNumber;

			if(namedAnchorPosition < 0)
				finalUrl = originalUrl + newArgString;
			else
				finalUrl = originalUrl.substring(0, namedAnchorPosition) + newArgString + originalUrl.substring(namedAnchorPosition);
			finalTag = originalTag.replace(originalUrl, finalUrl);
		}
		else
		{
			let concertjsServerUrlMatch = originalUrl.match(concertjsServerUrlRegExp);
			if(concertjsServerUrlMatch !== null)
			{
				let serverUrl = concertjsServerUrlMatch[1],
					filePath = (typeof(concertjsServerUrlMatch[3]) === "undefined" ? "" : concertjsServerUrlMatch[3]),
					fileNameOrFinalPathSegment = (typeof(concertjsServerUrlMatch[4]) === "undefined" ? "" : concertjsServerUrlMatch[4])
					argumentsExist = (typeof(concertjsServerUrlMatch[5]) !== "undefined"),
					existingArgumentString = (argumentsExist ? concertjsServerUrlMatch[5] : ""),
					namedAnchorString = (typeof(concertjsServerUrlMatch[6]) === "undefined" ? "" : concertjsServerUrlMatch[6]);

				finalUrl = serverUrl
					+ filePath
					+ fileNameOrFinalPathSegment
					+ existingArgumentString + (argumentsExist ? "&" : "?") + cacheBusterVariableName + "=" + buildNumber
					+ namedAnchorString;
				finalTag = originalTag.replace(originalUrl, finalUrl);
			}
			else
				finalTag = originalTag;
		}

		return finalTag;
	} // end htmlTagWithBuildNumberURL()


	// Project configuration.
	grunt.initConfig(
		{
			pkg: grunt.file.readJSON("package.json"),


			generateCaseData:
			{
				default:
				{
					files:
					[
						{
							src: "sourceData/caseRecords/us-counties_*.csv",
							dest: "src/data/caseRecords.csv"
						}
					]
				}
			},

			eslint:
			{
				projectStandards:
				{
					options: { configFile: "eslint.projectStandards.json" },
					files:
					[
						{
							expand: true,
							cwd: "src/",
							src: ["**/*.js", "!**/*.template.js", "!DocTemplates/**/*"]
						}
					]
				}
			}, // end eslint task definitions


			clean:
			{
				assembly: ["assembly/**/*"],

				www: ["dist/**/*"],

				removeAssembledOriginalJSandCSS:
				{
					src:
					[
						"assembly/**/*.js",
						"assembly/**/*.css",
						"!**/*.full.js",
						"!**/*.full.css"
					]
				},

				removeFullAndMinFiles:
				{
					src:
					[
						"dist/dev/**/*.full.*",
						"dist/dev/**/*.min.*",
						"dist/prod/**/*.full.*",
						"dist/prod/**/*.min.*"
					]
				}
			}, // end clean task definitions


			copy:
			{
				assembleSrcFiles:
				{
					files: [ { expand: true, cwd: "src/", src: ["**/*"], dest: "assembly/" } ]
				},

				copyOriginalToFull:
				{
					files:
					[
						{ expand: true, cwd: "assembly/", src: ["**/*.js"], dest: "assembly/", ext: ".full.js" },
						{ expand: true, cwd: "assembly/", src: ["**/*.css"], dest: "assembly/", ext: ".full.css" },
					]
				},

				deployAssembledFiles:
				{
					files:
					[
						{ expand: true, cwd: "assembly/", src: "**/*", dest: "dist/dev/" },
						{ expand: true, cwd: "assembly/", src: "**/*", dest: "dist/prod/" }
					]
				},

				deployComponents:
				{
					files:
					[
						{ src: "node_modules/concert.js/dist/Concert.mjs", dest: "dist/dev/modules/Concert.js" },
						{ src: "node_modules/papaparse/papaparse.js", dest: "dist/dev/scripts/papaparse.js" },
						{ src: "node_modules/vue/dist/vue.esm.browser.js", dest: "dist/dev/modules/vue.js" },

						{ src: "node_modules/concert.js/dist/Concert.min.mjs", dest: "dist/prod/modules/Concert.js" },
						{ src: "node_modules/papaparse/papaparse.min.js", dest: "dist/prod/scripts/papaparse.js" },
						{ src: "node_modules/vue/dist/vue.esm.browser.min.js", dest: "dist/prod/modules/vue.js" }
					]
				},

				selectEnvironment:
				{
					files:
					[
						{ expand: true, cwd: "dist/dev/", src: "**/*.full.css", dest: "dist/dev/", rename: stripMinOrFull },
						{ expand: true, cwd: "dist/dev/", src: "**/*.full.js", dest: "dist/dev/", rename: stripMinOrFull },

						{ expand: true, cwd: "dist/prod/", src: "**/*.min.css", dest: "dist/prod/", rename: stripMinOrFull },
						{ expand: true, cwd: "dist/prod/", src: "**/*.min.js", dest: "dist/prod/", rename: stripMinOrFull }
					]
				},

				quickDevSrcDeployment:
				{
					files: [ { expand: true, cwd: "src/", src: ["**/*"], dest: "dist/dev/" } ]
				}
			}, // end copy task defitions


			addBuildNumbers:
			{
				allOutputHTML: { expand: true, cwd: "dist", src: "**/*.html" }
			}, // end addBuildNumbers task definitions


			cssmin:
			{
				minifyAssembledCSS: { expand: true, cwd: "assembly/", src: "**/*.full.css", dest: "assembly/", ext: ".min.css" }
			}, // end cssmin task definitions


			terser:
			{
				options:
				{
					warnings: "verbose",
					parse: { ecma: 6 },
					compress:
					{
						sequences: false,
						typeofs: false,
						warnings: true
					},
					mangle: {},
					output: { comments: /^!/ }
				},

				minifyAssembledJS: { expand: true, cwd: "assembly/", src: ["**/*.full.js"], dest: "assembly/", ext: ".min.js" }
			} // end terser task definitions
	});
	
	
	// Load the plugins
	grunt.loadNpmTasks("grunt-contrib-clean");
	grunt.loadNpmTasks("grunt-contrib-copy");
	grunt.loadNpmTasks("grunt-contrib-cssmin");
	grunt.loadNpmTasks("grunt-eslint");
	grunt.loadNpmTasks("grunt-terser");
	

	// Define tasks
	grunt.registerMultiTask(
		"addBuildNumbers",
		"Update <a>, <script>, and <link> tags in all HTML output files to add a build number to the linked files, for cache-busting purposes",
		function()
		{
			const fileTargetExp = /<a\s+[^>]*href\s*=\s*"([^"#]+)[^"]*"[^>]*>|<link\s+[^>]*href\s*=\s*"([^"#]+)[^"]*"[^>]*>|<script\s+[^>]*src\s*=\s*"([^"#]+)[^"]*"[^>]*>/g;

			this.files.forEach(
				function (file)
				{
					let i, j, execResults, target, lastIndex, matchFound;

					for(i = 0; i < file.src.length; i++)
					{
						let curFileName = file.src[i],
							originalFileContents = grunt.file.read(curFileName),
							newFileContents;

						// grunt.log.writeln("Examining file:" + curFileName);

						matchFound = false;
						newFileContents = originalFileContents.replace(
							fileTargetExp,
							(match, p1, p2, p3, offset, fullString) =>
								{
									let target = [p1, p2, p3].find(element => typeof(element) === "string"),
										matchReplacement = htmlTagWithBuildNumberURL(match, target, cacheBusterVariableName, buildNumber);
									matchFound = true;
									// grunt.log.writeln("  found entry at position " + offset + ":" + match);
									// grunt.log.writeln("    target=" + target);
									// grunt.log.writeln("    replacement entry=" + matchReplacement);
									return matchReplacement;
								});

						if(matchFound)
							grunt.file.write(curFileName, newFileContents);
						// else
						// 	grunt.log.writeln("  No build numbers needed in this file.");
					}
				}) // end forEach loop over all files

				grunt.log.writeln("Processed " + this.files.length + " files. Current build number: " + buildNumber);
		}); // end call to grunt.registerMultiTask("addBuildNumbers"...)


	grunt.registerMultiTask(
		"generateCaseData",
		"Build case record file for web site from case record file from NYT",
		function()
		{
			const NYC_FIPS_CODES = ["36005", "36061", "36081", "36047", "36085"];

			function parseDate(dateString)
			{
				let pieces = dateString.split("-"),
					parsedDate = new Date(pieces[0], parseInt(pieces[1], 10) - 1, pieces[2]);
				if (isNaN(parsedDate.getTime()))
					throw "Error: invalid date string:" + dateString;
				return parsedDate;
			} // end parseDate()

			function addCountyRecord(counties, countyID, date, cases, deaths, state, countyName)
			{
				let intID = parseInt(countyID, 10),
					currentCounty = counties[intID];
				if (typeof currentCounty === "undefined")
					currentCounty = counties[intID] = { id: intID, dailyRecords: [] };
				currentCounty.dailyRecords.push({ date: date, cases: cases, deaths: deaths });
			}
		
			let mostRecentFile = null, destFile = null;
			this.files.forEach(
				function(file)
				{
					for (let i = 0; i < file.src.length; i++)
					{
						let fileName = file.src[i],
							datePortion = fileName.substring(fileName.lastIndexOf("_") + 1, fileName.length - 4),
							datePieces = datePortion.split("."),
							year = parseInt(datePieces[0], 10),
							month = parseInt(datePieces[1], 10),
							day = parseInt(datePieces[2], 10),
							fileDate = new Date(year, month - 1, day);
						if (mostRecentFile === null || mostRecentFile.fileDate < fileDate)
							mostRecentFile = { fileName: fileName, fileDate: fileDate };
					}
					grunt.log.writeln("Reading file: " + mostRecentFile.fileName);
					let fileContents = grunt.file.read(mostRecentFile.fileName);

					let parsedData = Papa.parse(
						fileContents,
						{
							header: true,
							transformHeader: header => ((header === "fips") ? "id" : header),
							skipEmptyLines: true
						}).data;
					fileContents = null;
		
					let counties = [], earliestDate = null, latestDate = null;
					parsedData.forEach(
						parsedRecord =>
						{
							let currentCountyID = parsedRecord.id, currentRecordDate = parseDate(parsedRecord.date);
							if (currentCountyID === "" && parsedRecord.county === "New York City" && parsedRecord.state === "New York" )
								NYC_FIPS_CODES.forEach(nycFipsCode => { addCountyRecord(counties, nycFipsCode, currentRecordDate, parsedRecord.cases, parsedRecord.deaths, parsedRecord.state, parsedRecord.county); });
							else if (currentCountyID !== "")
								addCountyRecord(counties, currentCountyID, currentRecordDate, parsedRecord.cases, parsedRecord.deaths, parsedRecord.state, parsedRecord.county);

							if (earliestDate === null || currentRecordDate < earliestDate)
								earliestDate = currentRecordDate;
							if (latestDate === null || currentRecordDate > latestDate)
								latestDate = currentRecordDate;
						});
					parsedData = null;
					
					let outputFileContents = "date,id,cases,deaths\r\n";
					counties.forEach(
						county =>
						{
							if (county.dailyRecords.length > 0)
							{
								county.dailyRecords.sort((a, b) => ((a < b) ? -1 : ((b > a) ? 1 : 0)));
								let lastFoundDailyRecord = null;
								for (let dateIterator = new Date(county.dailyRecords[0].date); dateIterator <= latestDate; dateIterator.setDate(dateIterator.getDate() + 1))
								{
									let currentDailyRecord = null;
									let currentRecordIndex = county.dailyRecords.findIndex(record => (record.date.getTime() === dateIterator.getTime()));
									if (currentRecordIndex >= 0)
									{
										currentDailyRecord = county.dailyRecords[currentRecordIndex];
										lastFoundDailyRecord = currentDailyRecord;
									}
									else if (lastFoundDailyRecord !== null)
										currentDailyRecord = lastFoundDailyRecord;
									else
										currentDailyRecord = { date: dateIterator, cases: 0, deaths: 0 };
									outputFileContents += currentDailyRecord.date.getFullYear()
										+ "-" + (currentDailyRecord.date.getMonth() + 1).toString().padStart(2, "0")
										+ "-" + currentDailyRecord.date.getDate().toString().padStart(2, "0") + ","
										+ county.id.toString().padStart(5, "0") + ","
										+ currentDailyRecord.cases + ","
										+ currentDailyRecord.deaths + "\r\n";
								}
							}
						});
					
						grunt.log.writeln("Data target file:" + file.dest);
						grunt.file.write(file.dest, outputFileContents);
						outputFileContents = null;
				});

		})
	

	grunt.registerTask("clean_all", ["clean:assembly", "clean:www"]);

	grunt.registerTask("lint_src", ["eslint:projectStandards"]);

	grunt.registerTask(
		"build_all",
		[
			"generateCaseData", // build the latest data file
			"copy:assembleSrcFiles", // copy source files into assembly directory
			"copy:copyOriginalToFull", // copy all .js and .css files in assembly directory to *.full.js and *.full.css
			"clean:removeAssembledOriginalJSandCSS", // remove all original .js and css files from assembly directory
			"terser:minifyAssembledJS", // minify all .full.js files in assembly directory into .min.js
			"cssmin:minifyAssembledCSS", // minify all .full.css files in assembly directory into .min.css
			"copy:deployAssembledFiles", // copy all assembly files into dev and prod directories
			"copy:selectEnvironment",  // copy, in prod directory, *.min.js to *.js and *.min.css to *.css, and in dev directory, *.full.js to *.js and *.full.css to *.css
			"clean:removeFullAndMinFiles", // clean all .min.css, .min.js, .full.css, and .full.js files from dev and prod directories
			"copy:deployComponents", // copy external components into dev and prod directories
			"addBuildNumbers:allOutputHTML" // add a build number url parameter to all src and href parameters in all the finished html files, for browser cache-busting purposes
		]);
	
	grunt.registerTask(
		"quickbuild_dev",
		[
			"lint_src", // check source
			"copy:quickDevSrcDeployment", // copy source files into dist/dev directory
			"copy:deployComponents", // copy external components into dev and prod directories
			"addBuildNumbers:allOutputHTML" // add a build number url parameter to all src and href parameters in all the finished html files, for browser cache-busting purposes
		]);
	
	grunt.registerTask(
		"superquickbuild_dev",
		[
			"copy:quickDevSrcDeployment", // copy source files into dist/dev directory
			"copy:deployComponents", // copy external components into dev and prod directories
			"addBuildNumbers:allOutputHTML" // add a build number url parameter to all src and href parameters in all the finished html files, for browser cache-busting purposes
		]);

		grunt.registerTask("rebuild_all", ["clean_all", "build_all"]);

	grunt.registerTask("default", ["lint_src", "rebuild_all"]);
};
