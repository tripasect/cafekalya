const fs = require('fs');

// Read the HTML file
const html = fs.readFileSync('menu.html', 'utf8');

// Convert Persian/Arabic numerals to English
const persianToEnglish = (str) => {
  const map = {
    '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4',
    '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9'
  };
  return str.replace(/[۰-۹]/g, (char) => map[char]);
};

// Convert English numerals to Persian
const englishToPersian = (str) => {
  const map = {
    '0': '۰', '1': '۱', '2': '۲', '3': '۳', '4': '۴',
    '5': '۵', '6': '۶', '7': '۷', '8': '۸', '9': '۹'
  };
  return str.replace(/[0-9]/g, (char) => map[char]);
};

// Replace all prices - match the h4 tag with class menu-price and capture content
const updatedHtml = html.replace(/<h4 class="tc-7376 menu-price">\s*([^<]+?)\s*<\/h4>/gs, (match, content) => {
  // Extract just the price number (remove <br> tags and whitespace)
  const cleanContent = content.replace(/<br>/g, '').trim();
  
  // If it's a dash, keep it as is
  if (cleanContent === '-') {
    return match;
  }
  
  // Convert to English numerals
  const englishPrice = persianToEnglish(cleanContent);
  
  // Double the price
  const doubled = parseInt(englishPrice) * 2;
  
  // Convert back to Persian numerals
  const persianPrice = englishToPersian(doubled.toString());
  
  // Replace the old price with the new one, preserving the original formatting
  return match.replace(cleanContent, persianPrice);
});

// Write the updated HTML back to the file
fs.writeFileSync('menu.html', updatedHtml, 'utf8');

console.log('✅ All prices have been doubled!');
