package com.javatpoint;

import java.awt.*;  
import java.awt.event.*;  
import java.io.InputStream;  
import java.net.*;  
import javax.swing.*;
public class SourceGetter extends JFrame {  
    JTextField config;
    JTextField sheet;
    JButton bconfig;
    JButton bsheet;
    JButton run;
    JLabel lmode,errormsg;
    int hight=30;
    int wight=10;
    JRadioButton gui,nongui; 
    String configpath,excelpath,mode,error;  
    JFileChooser chooser;
    ButtonGroup bg;
     
     void SourceGetter(){  
         
        
        
        bconfig = new JButton("Test Config");
        bconfig.setBounds(50,100,wight+100,hight);
        bconfig.setName("properties");
        bconfig.addActionListener(new ActionListener() {
			public void actionPerformed(ActionEvent arg0) {
				config.setText(openFile(bconfig));
			}
		});
        config=new JTextField();
        config.setBounds(170, 100, wight+250, hight);
        add(bconfig);add(config);
        
        
        
        bsheet = new JButton("Test Input Sheet");
        bsheet.setBounds(50,150,wight+100,hight);
        bsheet.setName("xlsx");
        bsheet.addActionListener(new ActionListener() {
			public void actionPerformed(ActionEvent arg0) {
				sheet.setText(openFile(bsheet));
				
			}
		});
        sheet=new JTextField(null);
        sheet.setBounds(170, 150, wight+250, hight);
        add(bsheet);add(sheet);
        
        lmode=new JLabel("Mode : ");  
        lmode.setBounds(50,200,50,20);  
        gui=new JRadioButton("GUI");    
        gui.setBounds(150,200,100,20);      
        nongui=new JRadioButton("NON-GUI");    
        nongui.setBounds(250,200,100,20); 
         bg=new ButtonGroup(); 
        bg.add(gui);bg.add(nongui); 
        gui.addActionListener(new ActionListener() {
			public void actionPerformed(ActionEvent arg0) {
			if(gui.isSelected())	
			mode="GUI";
				
			}
		});
        nongui.addActionListener(new ActionListener() {
			public void actionPerformed(ActionEvent arg0) {
			if(nongui.isSelected())	
			mode="NON-GUI";
				
			}
		});
        add(lmode);add(gui);add(nongui);add(bconfig);

        run = new JButton("Run");
        run.setBounds(170,250,wight+100,hight);  
        run.addActionListener(new ActionListener() {
			public void actionPerformed(ActionEvent arg0) {
				error="";
				excelpath=sheet.getText();
				configpath=config.getText();
				if(excelpath.equals("") || configpath.equals(""))
					error="Please check inputs.";
				else
				if(mode!=null)
				if(mode.equalsIgnoreCase("GUI"))
					System.out.println("Giu");
				else 
					System.out.println("Nongui");
				else
					error=error+"Please select Mode first !!!";
				errormsg.setText(error);
		        
			}
		});
        errormsg=new JLabel(error);  
        errormsg.setBounds(10,300,500,20); 
        add(run);add(errormsg);
        setSize(500,500);  
        setDefaultCloseOperation(DISPOSE_ON_CLOSE);
        setLayout(null);  
        try {
			 
			UIManager.setLookAndFeel("javax.swing.plaf.nimbus.NimbusLookAndFeel");
			SwingUtilities.updateComponentTreeUI(this);
			 
		} catch (Exception e) {
			e.printStackTrace();
		}
        setVisible(true);  
    }  
    public static void main(String[] args) {  
    	SourceGetter SourceGette=new SourceGetter();
    	SourceGette.SourceGetter();
    }
	 
	
	public String openFile(JButton bconfig2)
	{
		String name = bconfig2.getName();
		chooser=new JFileChooser();
		chooser.removeChoosableFileFilter(chooser.getFileFilter());
		chooser.addChoosableFileFilter(new MyFileFilter("."+name,name+" File(*."+name+")"));
		
		
	chooser.setDialogTitle("Open "+name+" File...");
	chooser.setApproveButtonText("Open this"); 
	
	chooser.setApproveButtonToolTipText("Click me to open the selected file.!");
	if(chooser.showOpenDialog(bconfig2)!=JFileChooser.APPROVE_OPTION)
		return null;
	return chooser.getSelectedFile().getAbsolutePath();

	}

}  